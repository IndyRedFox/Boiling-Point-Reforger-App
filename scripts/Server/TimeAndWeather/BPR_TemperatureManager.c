// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_TemperatureManager.c
// Author: Indy & AI Assistant
// Description: Central Server Temperature Manager (Caller: TempMgr).
//              - Resolves the 4-tier Climate Profile Cascade during Loading phase:
//                1. Custom JSON (BPR_CustomClimate)
//                2. Terrains Database (BPR_ClimateDatabase)
//                3. Coordinates Insolation Generator (BPR_CoordinatesClimateGenerator)
//                4. Safe Fallback Profile (BPR_ClimateFallback)
//              - Cycle 1 (System, Simple & Fallback):
//                * Smooth monthly min/max interpolation (seamless day-by-day transitions).
//                * Multi-day synoptic weather anomalies (high/low pressure systems lasting 2-5 days, ±4°C).
//                * 24-hour diurnal solar curve (minimum at 05:30, maximum at 14:30).
//                * Realistic weather damping (clouds, rain cooling, fog).
//              - Cycle 2 (Open-Meteo):
//                * Checks for immediate data availability on startup.
//                * Glides smoothly between 15-minute real-world measurement intervals.
//                * Automatic watchdog and seamless fallback to Cycle 1 if API data is delayed or lost.
//              - Smooth Slew-Rate Limiter (prevents sudden temperature jumps).
// ============================================================================

class BPR_TemperatureManager
{
	const static string CALLER_ID = "TempMgr";
	const static int UPDATE_INTERVAL_MS = 60000;              // Update cycle every 60 seconds (1 minute)
	const static float MAX_TEMP_SLEW_PER_MINUTE = 0.20;       // Max temperature change of 0.2°C per minute

	protected static ref BPR_TemperatureManager s_pInstance;

	// Climate profile and cascade
	protected ref BPR_ClimateProfile m_pActiveClimateProfile;
	protected BPR_EClimateZone m_eActiveClimateZone = BPR_EClimateZone.CONTINENTAL;
	protected int m_iResolvedCascadeTier = 0;
	protected string m_sProfileSource = "";

	// Operational state
	protected bool m_bIsInitialized = false;
	protected int m_iWeatherMode = 2;                         // 1=System, 2=Simple, 3=OpenMeteoReal, 4=OpenMeteoCustom
	protected int m_iActiveCycle = 1;                         // 1=Climate/Synoptic, 2=OpenMeteo
	protected bool m_bIsFallbackActive = false;
	protected string m_sCurrentWeatherState = "Clear";

	// Temperature state
	protected float m_fCurrentTemperature = 15.0;             // Active physical air temperature (°C)
	protected float m_fTargetTemperature = 15.0;              // Target temperature for smooth interpolation (°C)
	protected float m_fDayMinTemperature = 10.0;              // Current day interpolated min temperature
	protected float m_fDayMaxTemperature = 20.0;              // Current day interpolated max temperature
	protected float m_fLastReplicatedTemperature = -999.0;    // Last temperature synced to NetworkManager (°C)
	protected const float REPLICATION_TEMPERATURE_THRESHOLD = 0.1; // Delta threshold (°C) to trigger network replication

	// Multi-day synoptic anomaly (High/Low pressure patterns lasting 2-5 days)
	protected float m_fSynopticAnomaly = 0.0;                 // Current active anomaly offset (°C)
	protected float m_fTargetSynopticAnomaly = 0.0;           // Target anomaly offset for next period
	protected int m_iAnomalyDaysRemaining = 0;                // Days remaining for current synoptic pattern
	protected int m_iLastEvaluatedDay = -1;                   // Tracks in-game day changes

	// Open-Meteo tracking
	protected int m_iLastOMIntervalIndex = -1;
	protected float m_fOMIntervalStartTemp = 15.0;
	protected float m_fOMIntervalTargetTemp = 15.0;

	// Events
	protected ref ScriptInvoker m_OnTemperatureUpdated;

	// Time Manager entity reference
	protected TimeAndWeatherManagerEntity m_pTimeManager;

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_TemperatureManager()
	{
		m_OnTemperatureUpdated = new ScriptInvoker();
	}

	//------------------------------------------------------------------------------------------------
	//! Singleton instance getter
	static BPR_TemperatureManager GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_TemperatureManager();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! Event invoker: (float fCurrentTemp, int iCycle, bool bFallbackActive)
	ScriptInvoker GetOnTemperatureUpdated()
	{
		return m_OnTemperatureUpdated;
	}

	//------------------------------------------------------------------------------------------------
	//! Pre-resolves the 4-tier climate cascade and prepares profile in memory (called by LoadingManager, does not start simulation)
	void ResolveClimateCascade()
	{
		if (m_pActiveClimateProfile)
			return;

		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		// Read server config for WeatherMode
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (pConfig)
			m_iWeatherMode = pConfig.iWeatherMode;
		else
			m_iWeatherMode = 2;

		// 1. Resolve Climate Profile Cascade (Tiers 1 to 4)
		ResolveClimateProfileInternal();

		// 2. Roll initial multi-day synoptic anomaly
		RollNewSynopticAnomaly();
		m_fSynopticAnomaly = m_fTargetSynopticAnomaly;

		DebugLog.Info(CALLER_ID, "Climate cascade successfully prepared in LoadingManager (cycles idle until weather start).");
	}

	//------------------------------------------------------------------------------------------------
	//! Starts the active temperature simulation and tick queue with initial weather state (called by Weather Providers)
	void StartSimulation(string sInitialWeatherState = "Clear")
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		// Ensure climate cascade is resolved
		if (!m_pActiveClimateProfile)
			ResolveClimateCascade();

		if (sInitialWeatherState != "")
			m_sCurrentWeatherState = sInitialWeatherState;

		// Determine active cycle based on WeatherMode & Open-Meteo readiness
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			// Check if Open-Meteo already has valid data available
			if (BPR_FetchOpenMeteoData.HasValidData())
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "Open-Meteo data already available. Starting directly in Cycle 2.");
			}
			else
			{
				// Open-Meteo not ready yet -> start in Cycle 1 as fallback and register listener
				m_iActiveCycle = 1;
				m_bIsFallbackActive = true;
				DebugLog.Info(CALLER_ID, "Open-Meteo data pending. Starting temporarily in Cycle 1 (Fallback).");

				BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
				if (pFetchService)
					pFetchService.GetOnWeatherDataUpdated().Insert(OnOpenMeteoDataReceived);
			}
		}
		else
		{
			m_iActiveCycle = 1;
			m_bIsFallbackActive = false;
			DebugLog.Info(CALLER_ID, string.Format("Starting in Cycle 1 (Climate/Synoptic) for weather mode %1.", m_iWeatherMode));
		}

		// In Mode 1 (System Weather), query engine weather state immediately if available
		if (m_iWeatherMode == 1)
		{
			PollEngineWeatherState();
		}

		// Calculate initial start temperature based on initial weather state
		CalculateImmediateStartTemperature();

		// Start periodic update loop
		GetGame().GetCallqueue().Remove(OnUpdateTick);
		GetGame().GetCallqueue().CallLater(OnUpdateTick, UPDATE_INTERVAL_MS, true);

		DebugLog.Info(CALLER_ID, string.Format("TemperatureManager started with weather '%1' -> initial temperature: %2°C (Cycle %3).",
			m_sCurrentWeatherState, Math.Round(m_fCurrentTemperature * 10.0) / 10.0, m_iActiveCycle));
	}

	//------------------------------------------------------------------------------------------------
	//! Legacy/Default initializer: resolves cascade and starts simulation with "Clear" weather
	void Init()
	{
		ResolveClimateCascade();
		StartSimulation("Clear");
	}

	// ===============================================================================================
	// CLIMATE PROFILE CASCADE RESOLUTION (Tiers 1 - 4)
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Resolves the 4-tier climate cascade in strict order
	protected void ResolveClimateProfileInternal()
	{
		// Tier 1: Custom Climate JSON file
		m_pActiveClimateProfile = BPR_CustomClimate.TryGetProfile();
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 1;
			m_sProfileSource = string.Format("Tier 1: Custom JSON (%1)", m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 2: Terrains Climate Database
		string sMapName = "";
		BPR_MapUtility.GetMapName(sMapName);
		m_pActiveClimateProfile = BPR_ClimateDatabase.GetProfileForMap(sMapName);
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 2;
			m_sProfileSource = string.Format("Tier 2: Map Database for '%1' (%2)", sMapName, m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 3: Coordinates Solar Insolation Generator
		float fLatitude = 999.0;
		float fLongitude = 999.0;
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (pConfig && pConfig.sCoordinates != "")
		{
			BPR_MapUtility.ParseCoordinates(pConfig.sCoordinates, fLatitude, fLongitude);
		}

		m_pActiveClimateProfile = BPR_CoordinatesClimateGenerator.GenerateProfile(fLatitude, fLongitude);
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 3;
			m_sProfileSource = string.Format("Tier 3: Coordinates Generator (%1)", m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 4: Safe Hardcoded Fallback Profile
		m_pActiveClimateProfile = BPR_ClimateFallback.GetFallbackProfile();
		m_iResolvedCascadeTier = 4;
		m_sProfileSource = "Tier 4: Safety Fallback (Bohemia Interactive HQ, Prague)";
		LogCascadeResolution();
	}

	//------------------------------------------------------------------------------------------------
	//! Logs formatted cascade resolution info
	protected void LogCascadeResolution()
	{
		if (!m_pActiveClimateProfile)
			return;

		m_eActiveClimateZone = m_pActiveClimateProfile.m_eClimateZone;
		string sZoneName = BPR_ClimateProfile.ClimateZoneToString(m_eActiveClimateZone);

		DebugLog.Info(CALLER_ID, string.Format("Climate profile successfully resolved: %1 | Zone: %2", m_sProfileSource, sZoneName));
		DebugLog.Info(CALLER_ID, string.Format("Climate range Jan: %1..%2°C | Jul: %3..%4°C",
			Math.Round(m_pActiveClimateProfile.m_aMinTemp[0]), Math.Round(m_pActiveClimateProfile.m_aMaxTemp[0]),
			Math.Round(m_pActiveClimateProfile.m_aMinTemp[6]), Math.Round(m_pActiveClimateProfile.m_aMaxTemp[6])));
	}

	// ===============================================================================================
	// CORE TEMPERATURE CALCULATION
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates instantaneous temperature at mission start to prevent cold/hot step jumps
	protected void CalculateImmediateStartTemperature()
	{
		if (m_iActiveCycle == 2 && BPR_FetchOpenMeteoData.HasValidData())
		{
			float fTargetTemp = CalculateCycle2Target();
			m_fCurrentTemperature = fTargetTemp;
			m_fTargetTemperature = fTargetTemp;
		}
		else
		{
			float fTargetTemp = CalculateCycle1Target();
			m_fCurrentTemperature = fTargetTemp;
			m_fTargetTemperature = fTargetTemp;
		}

		// Replicate initial temperature to NetworkManager for immediate JIP availability
		SyncNetworkTemperature(true);
	}

	//------------------------------------------------------------------------------------------------
	//! Replicates base temperature to the global network manager if delta threshold is reached or forced
	protected void SyncNetworkTemperature(bool bForceSync = false)
	{
		if (!bForceSync && Math.AbsFloat(m_fCurrentTemperature - m_fLastReplicatedTemperature) < REPLICATION_TEMPERATURE_THRESHOLD)
			return;

		m_fLastReplicatedTemperature = m_fCurrentTemperature;

		BPR_NetworkManagerComponent pNetworkManager = BPR_NetworkManagerComponent.GetInstance();
		if (pNetworkManager)
			pNetworkManager.SetBaseTemperature(m_fCurrentTemperature);
	}

	//------------------------------------------------------------------------------------------------
	//! Periodic tick handler executed every 60 seconds
	protected void OnUpdateTick()
	{
		// 1. Check for day rollover to manage multi-day synoptic anomalies
		int iCurrentYear = 2026;
		int iCurrentMonth = 6;
		int iCurrentDay = 15;
		int iCurrentHour = 12;
		int iCurrentMinute = 0;
		int iCurrentSecond = 0;

		GetInGameDateTime(iCurrentYear, iCurrentMonth, iCurrentDay, iCurrentHour, iCurrentMinute, iCurrentSecond);

		if (m_iLastEvaluatedDay != iCurrentDay)
		{
			OnDayChanged(iCurrentDay);
		}

		// 2. Mode 1: Periodically poll engine weather state if in System Weather Mode
		if (m_iWeatherMode == 1)
		{
			PollEngineWeatherState();
		}

		// 3. Check Open-Meteo watchdog if in mode 3 or 4
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			bool bHasOMData = BPR_FetchOpenMeteoData.HasValidData();
			if (bHasOMData && m_bIsFallbackActive)
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "Open-Meteo data received. Ending fallback and switching to Cycle 2.");
			}
			else if (!bHasOMData && !m_bIsFallbackActive)
			{
				m_iActiveCycle = 1;
				m_bIsFallbackActive = true;
				DebugLog.Warn(CALLER_ID, "Open-Meteo data unavailable. Activating Cycle 1 as fallback.");
			}
		}

		// 4. Compute target temperature for active cycle
		if (m_iActiveCycle == 2 && !m_bIsFallbackActive)
		{
			m_fTargetTemperature = CalculateCycle2Target();
		}
		else
		{
			m_fTargetTemperature = CalculateCycle1Target();
		}

		// 5. Smooth Slew-Rate Limiter (Max 0.20°C per minute)
		float fTempDelta = m_fTargetTemperature - m_fCurrentTemperature;
		float fMaxStep = MAX_TEMP_SLEW_PER_MINUTE;

		if (Math.AbsFloat(fTempDelta) <= fMaxStep)
		{
			m_fCurrentTemperature = m_fTargetTemperature;
		}
		else
		{
			if (fTempDelta > 0.0)
				m_fCurrentTemperature += fMaxStep;
			else
				m_fCurrentTemperature -= fMaxStep;
		}

		// 6. Broadcast to listeners (Survival, UI, Vehicle Systems)
		if (m_OnTemperatureUpdated)
			m_OnTemperatureUpdated.Invoke(m_fCurrentTemperature, m_iActiveCycle, m_bIsFallbackActive);

		// 7. Replicate to NetworkManager for clients and JIP synchronization if delta threshold is exceeded
		SyncNetworkTemperature();
	}

	//------------------------------------------------------------------------------------------------
	//! Polls the active weather state directly from TimeAndWeatherManagerEntity (used in Mode 1: System Weather)
	protected void PollEngineWeatherState()
	{
		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (!m_pTimeManager)
			return;

		WeatherState pWeatherState = m_pTimeManager.GetCurrentWeatherState();
		if (pWeatherState)
		{
			string sEngineWeather = pWeatherState.GetStateName();
			if (sEngineWeather != "" && sEngineWeather != m_sCurrentWeatherState)
			{
				m_sCurrentWeatherState = sEngineWeather;
				DebugLog.Info(CALLER_ID, string.Format("System weather state detected from engine: %1", m_sCurrentWeatherState));
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Callback invoked when Open-Meteo asynchronous data finishes downloading
	protected void OnOpenMeteoDataReceived()
	{
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			if (m_bIsFallbackActive)
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "OnOpenMeteoDataReceived: Fresh API data available -> Cycle 2 activated.");
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Handles day rollover: advances synoptic anomaly countdown or generates new anomaly
	protected void OnDayChanged(int iNewDay)
	{
		m_iLastEvaluatedDay = iNewDay;

		m_iAnomalyDaysRemaining--;
		if (m_iAnomalyDaysRemaining <= 0)
		{
			RollNewSynopticAnomaly();
		}
		else
		{
			// Gently ease towards active target anomaly
			m_fSynopticAnomaly = Math.Lerp(m_fSynopticAnomaly, m_fTargetSynopticAnomaly, 0.5);
		}

		DebugLog.Info(CALLER_ID, string.Format("Day rollover registered (Day %1). Synoptic anomaly: %2°C (Remaining: %3 days).",
			iNewDay, Math.Round(m_fSynopticAnomaly * 10.0) / 10.0, m_iAnomalyDaysRemaining));
	}

	//------------------------------------------------------------------------------------------------
	//! Rolls a new multi-day high/low pressure anomaly (2-5 days, ±4.0°C)
	protected void RollNewSynopticAnomaly()
	{
		m_iAnomalyDaysRemaining = Math.RandomIntInclusive(2, 5);
		m_fTargetSynopticAnomaly = Math.RandomFloatInclusive(-4.0, 4.0);
		m_fSynopticAnomaly = Math.Lerp(m_fSynopticAnomaly, m_fTargetSynopticAnomaly, 0.4);

		string sSystemType = "Normal";
		if (m_fTargetSynopticAnomaly >= 1.5)
			sSystemType = "High Pressure (Warm Phase)";
		else if (m_fTargetSynopticAnomaly <= -1.5)
			sSystemType = "Low Pressure (Cold Phase)";

		DebugLog.Info(CALLER_ID, string.Format("New synoptic weather pattern: %1 (%2°C for %3 days).",
			sSystemType, Math.Round(m_fTargetSynopticAnomaly * 10.0) / 10.0, m_iAnomalyDaysRemaining));
	}

	// ===============================================================================================
	// ZYKLUS 1: KLIMA-TABELLE, SYNOPTIK & TAGESGANGLINIE
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates target temperature for Cycle 1
	protected float CalculateCycle1Target()
	{
		if (!m_pActiveClimateProfile)
			return 15.0;

		int iYear = 2026;
		int iMonth = 6;
		int iDay = 15;
		int iHour = 12;
		int iMinute = 0;
		int iSecond = 0;

		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		// 1. Calculate continuous Daily Min & Max from monthly climate table
		float fInterpolatedMin = 10.0;
		float fInterpolatedMax = 20.0;
		InterpolateMonthlyMinMax(iMonth, iDay, fInterpolatedMin, fInterpolatedMax);

		// 2. Apply multi-day synoptic anomaly (High/Low pressure)
		m_fDayMinTemperature = fInterpolatedMin + m_fSynopticAnomaly;
		m_fDayMaxTemperature = fInterpolatedMax + m_fSynopticAnomaly;

		// 3. Calculate 24-hour diurnal solar curve (Min ~05:30, Max ~14:30)
		float fTimeOfDayHours = iHour + (iMinute / 60.0);
		float fBaseTemp = EvaluateDiurnalCurve(fTimeOfDayHours, m_fDayMinTemperature, m_fDayMaxTemperature);

		// 4. Apply weather dampening (rain cooling, overcast insulation, fog)
		float fWeatherOffset = CalculateWeatherDamping(fTimeOfDayHours, m_sCurrentWeatherState);

		return fBaseTemp + fWeatherOffset;
	}

	//------------------------------------------------------------------------------------------------
	//! Smoothly interpolates daily min/max between months based on the day of the month
	protected void InterpolateMonthlyMinMax(int iMonth, int iDay, out float fOutMin, out float fOutMax)
	{
		fOutMin = 10.0;
		fOutMax = 20.0;

		if (!m_pActiveClimateProfile || m_pActiveClimateProfile.m_aMinTemp.Count() < 12)
			return;

		int iMonthIdx = Math.Clamp(iMonth - 1, 0, 11);

		// The 15th is the exact center of the current month
		if (iDay == 15)
		{
			fOutMin = m_pActiveClimateProfile.m_aMinTemp[iMonthIdx];
			fOutMax = m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx];
			return;
		}

		int iNeighborMonthIdx;
		float fInterpolationFactor;

		if (iDay < 15)
		{
			// Interpolate with previous month
			iNeighborMonthIdx = (iMonthIdx + 11) % 12;
			// Day 1: ~50% towards prev month, Day 15: 0% towards prev month
			fInterpolationFactor = (15.0 - iDay) / 30.0;
			fOutMin = Math.Lerp(m_pActiveClimateProfile.m_aMinTemp[iMonthIdx], m_pActiveClimateProfile.m_aMinTemp[iNeighborMonthIdx], fInterpolationFactor);
			fOutMax = Math.Lerp(m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx], m_pActiveClimateProfile.m_aMaxTemp[iNeighborMonthIdx], fInterpolationFactor);
		}
		else
		{
			// Interpolate with next month
			iNeighborMonthIdx = (iMonthIdx + 1) % 12;
			// Day 15: 0% towards next month, Day 31: ~50% towards next month
			fInterpolationFactor = (iDay - 15.0) / 30.0;
			fOutMin = Math.Lerp(m_pActiveClimateProfile.m_aMinTemp[iMonthIdx], m_pActiveClimateProfile.m_aMinTemp[iNeighborMonthIdx], fInterpolationFactor);
			fOutMax = Math.Lerp(m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx], m_pActiveClimateProfile.m_aMaxTemp[iNeighborMonthIdx], fInterpolationFactor);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates diurnal solar temperature curve for any hour of the day (0.0 to 24.0)
	//! Daily minimum at ~05:30 (dawn), Daily maximum at ~14:30 (solar afternoon lag)
	protected float EvaluateDiurnalCurve(float fHour, float fMinTemp, float fMaxTemp)
	{
		float fSpread = fMaxTemp - fMinTemp;
		float fNormalizedFactor;

		if (fHour >= 5.5 && fHour <= 14.5)
		{
			// Day warming phase (9 hours from 05:30 to 14:30)
			float fPhase = (fHour - 5.5) / 9.0;
			// Cosine ease from 0.0 to 1.0
			fNormalizedFactor = (1.0 - Math.Cos(fPhase * Math.PI)) * 0.5;
		}
		else
		{
			// Night cooling phase (15 hours from 14:30 to 05:30 next morning)
			float fNightHour = fHour;
			if (fNightHour < 5.5)
				fNightHour += 24.0;

			float fPhase = (fNightHour - 14.5) / 15.0;
			// Cosine ease from 1.0 down to 0.0
			fNormalizedFactor = (1.0 + Math.Cos(fPhase * Math.PI)) * 0.5;
		}

		return fMinTemp + (fSpread * fNormalizedFactor);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates physical weather offsets for clouds, rain, thunder, and fog (Cycle 1 only)
	protected float CalculateWeatherDamping(float fHour, string sWeatherState)
	{
		bool bIsDaytime = (fHour >= 7.0 && fHour <= 19.0);
		float fOffset = 0.0;
		string sLowerState = sWeatherState;
		sLowerState.ToLower();

		// 1. Cloud Cover Base (Solar dampening during day, greenhouse insulation vs. radiative cooling at night)
		if (sLowerState.Contains("overcast") || sLowerState.Contains("overkast"))
		{
			if (bIsDaytime)
				fOffset -= 3.5;
			else
				fOffset += 2.0; // Dense cloud blanket traps infrared heat (mild, prevents frost)
		}
		else if (sLowerState.Contains("broken"))
		{
			if (bIsDaytime)
				fOffset -= 2.5;
			else
				fOffset += 1.0;
		}
		else if (sLowerState.Contains("cloudy"))
		{
			if (bIsDaytime)
				fOffset -= 1.5;
			else
				fOffset += 0.0; // Balanced
		}
		else if (sLowerState.Contains("few"))
		{
			if (bIsDaytime)
				fOffset -= 0.5;
			else
				fOffset -= 1.5; // Mild radiative cooling into space
		}
		else
		{
			// "Clear" / default: maximum solar heating by day (0.0), strong radiative cooling into space at night (-2.5°C -> frost trigger)
			if (!bIsDaytime)
				fOffset -= 2.5;
		}

		// 2. Precipitation / Rain (Evaporative cooling and cold rainfall)
		// Note: "Extreme" and "Rainy" are treated as equal
		if (sLowerState.Contains("extreme") || sLowerState.Contains("rainy"))
		{
			if (bIsDaytime)
				fOffset -= 3.5;
			else
				fOffset -= 2.0;
		}
		else if (sLowerState.Contains("strong"))
		{
			if (bIsDaytime)
				fOffset -= 2.5;
			else
				fOffset -= 1.5;
		}
		else if (sLowerState.Contains("normal"))
		{
			if (bIsDaytime)
				fOffset -= 1.5;
			else
				fOffset -= 1.0;
		}
		else if (sLowerState.Contains("drizzle"))
		{
			fOffset -= 0.5;
		}

		// 3. Thunderstorm Downdrafts (cold falling air currents)
		if (sLowerState.Contains("thunder"))
		{
			fOffset -= 1.0;
		}

		// 4. Fog effect: dampens morning warming
		BPR_FogDynamicsProcessor pFogProcessor = BPR_FogDynamicsProcessor.GetInstance();
		if (pFogProcessor && !pFogProcessor.IsHibernating())
		{
			float fFogDensity = pFogProcessor.GetEffectiveDensity();
			if (bIsDaytime && fHour <= 11.0)
				fOffset -= (1.5 * fFogDensity);
		}

		return fOffset;
	}

	// ===============================================================================================
	// ZYKLUS 2: OPEN-METEO 15-MINUTEN-GLEITER
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates target temperature for Cycle 2 (smooth 15-minute interpolation)
	protected float CalculateCycle2Target()
	{
		int iYear = 2026;
		int iMonth = 6;
		int iDay = 15;
		int iHour = 12;
		int iMinute = 0;
		int iSecond = 0;

		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = (iHour * 4) + (iMinute / 15);
		int iMinuteInInterval = iMinute % 15;
		float fIntervalProgress = (iMinuteInInterval + (iSecond / 60.0)) / 15.0;

		float fCurrentIntervalTemp = 15.0;
		float fNextIntervalTemp = 15.0;

		float fDummyFloat;
		int iDummyInt;

		// Fetch current interval
		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iCurrentIntervalIndex, fCurrentIntervalTemp, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat, iDummyInt, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat))
		{
			return m_fCurrentTemperature;
		}

		// Fetch next interval (wrap to interval 0 of next day if at end)
		int iNextIntervalIndex = iCurrentIntervalIndex + 1;
		if (iNextIntervalIndex >= BPR_FetchOpenMeteoData.GetDataCount())
			iNextIntervalIndex = iCurrentIntervalIndex;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iNextIntervalIndex, fNextIntervalTemp, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat, iDummyInt, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat))
		{
			fNextIntervalTemp = fCurrentIntervalTemp;
		}

		// Smooth minute-by-minute glide between 15-minute measurements
		return Math.Lerp(fCurrentIntervalTemp, fNextIntervalTemp, fIntervalProgress);
	}

	// ===============================================================================================
	// UTILITIES & ENGINE TIME
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Retrieves current in-game date and time from TimeAndWeatherManagerEntity
	protected void GetInGameDateTime(out int iYear, out int iMonth, out int iDay, out int iHour, out int iMinute, out int iSecond)
	{
		iYear = 2026;
		iMonth = 6;
		iDay = 15;
		iHour = 12;
		iMinute = 0;
		iSecond = 0;

		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (m_pTimeManager)
		{
			m_pTimeManager.GetDate(iYear, iMonth, iDay);
			m_pTimeManager.GetHoursMinutesSeconds(iHour, iMinute, iSecond);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! External notification from Weather Providers to update current weather state for Cycle 1 damping
	void NotifyWeatherStateChanged(string sWeatherState)
	{
		m_sCurrentWeatherState = sWeatherState;
		DebugLog.Info(CALLER_ID, string.Format("Weather state updated: %1", m_sCurrentWeatherState));
	}

	// ===============================================================================================
	// GETTERS
	// ===============================================================================================

	//! Returns current physical air temperature (°C)
	float GetCurrentTemperature()
	{
		return m_fCurrentTemperature;
	}

	//! Returns active target temperature (°C)
	float GetTargetTemperature()
	{
		return m_fTargetTemperature;
	}

	//! Returns current day's calculated minimum temperature (°C)
	float GetDayMinTemperature()
	{
		return m_fDayMinTemperature;
	}

	//! Returns current day's calculated maximum temperature (°C)
	float GetDayMaxTemperature()
	{
		return m_fDayMaxTemperature;
	}

	//! Returns currently active simulation cycle (1 = Climate/Synoptic, 2 = Open-Meteo)
	int GetActiveCycle()
	{
		return m_iActiveCycle;
	}

	//! Returns whether fallback to Cycle 1 is currently active (when in Open-Meteo mode)
	bool IsFallbackActive()
	{
		return m_bIsFallbackActive;
	}

	//! Returns the active BPR_ClimateProfile
	BPR_ClimateProfile GetActiveClimateProfile()
	{
		return m_pActiveClimateProfile;
	}

	//! Returns the resolved cascade tier (1-4)
	int GetResolvedCascadeTier()
	{
		return m_iResolvedCascadeTier;
	}

	//! Returns the profile source description
	string GetProfileSource()
	{
		return m_sProfileSource;
	}

	//! Returns the active climate zone enum
	BPR_EClimateZone GetActiveClimateZone()
	{
		return m_eActiveClimateZone;
	}

	//! Returns the active climate zone name as string
	string GetActiveClimateZoneName()
	{
		return BPR_ClimateProfile.ClimateZoneToString(m_eActiveClimateZone);
	}

	//! Static helper: Returns active climate zone enum (or CONTINENTAL default if uninitialized)
	static BPR_EClimateZone GetCurrentClimateZone()
	{
		if (!s_pInstance)
			return BPR_EClimateZone.CONTINENTAL;

		return s_pInstance.m_eActiveClimateZone;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance for clean mission restart
	static void Reset()
	{
		if (s_pInstance)
		{
			GetGame().GetCallqueue().Remove(s_pInstance.OnUpdateTick);

			BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
			if (pFetchService)
				pFetchService.GetOnWeatherDataUpdated().Remove(s_pInstance.OnOpenMeteoDataReceived);

			if (s_pInstance.m_OnTemperatureUpdated)
				s_pInstance.m_OnTemperatureUpdated.Clear();

			s_pInstance = null;
		}
	}
};
