// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherProviderOpenMeteo.c
// Author: Indy & AI Assistant
// Description: Server-side Open-Meteo Real-World Weather Provider for Boiling Point Reforger.
//              - Ingests high-resolution 15-minute real-world forecast data from BPR_FetchOpenMeteoData.
//              - Evaluates cloud cover, precipitation, and WMO codes to select authentic Enfusion weather states.
//              - Uses the upcoming 15-minute forecast as smooth glide target via ForceWeatherTo.
//              - Synchronizes wind speed, direction, and gusts with BPR_WindDynamicsProcessor.
//              - Combines visibility and relative humidity to dynamically drive BPR_FogDynamicsProcessor.
//              - Handles convective thunderstorm fronts with accelerated dramatic transitions.
//              - Provides seamless fallback to BPR_WeatherProviderSimple if network data is pending or unavailable.
//              - Includes full Workbench reset and cleanup capabilities.
// ============================================================================

class BPR_WeatherProviderOpenMeteo
{
	const static string CALLER_ID = "WeProOM";

	protected bool m_bIsInitialized;
	protected bool m_bIsFallbackActive;
	protected float m_fLatitude;
	protected float m_fLongitude;

	protected string m_sCurrentWeatherState;
	protected bool m_bHadRecentRain;

	// Component & Service References
	protected TimeAndWeatherManagerEntity m_pWeatherMgr;
	protected ref BPR_WeatherProviderSimple m_pFallbackProvider;

	//------------------------------------------------------------------------------------------------
	//! Initializes Open-Meteo Weather Provider with geographical coordinates
	void Init(float fLatitude, float fLongitude)
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		m_fLatitude = fLatitude;
		m_fLongitude = fLongitude;
		m_sCurrentWeatherState = "Clear";
		m_bHadRecentRain = false;

		// Retrieve TimeAndWeatherManagerEntity
		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "Initialization aborted: TimeAndWeatherManagerEntity not found!");
			return;
		}

		// Connect to FetchOpenMeteoData update invoker
		BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
		if (pFetchService)
		{
			pFetchService.GetOnWeatherDataUpdated().Remove(OnWeatherDataReceived);
			pFetchService.GetOnWeatherDataUpdated().Insert(OnWeatherDataReceived);
		}

		// Check if valid forecast data is already present in memory
		if (BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Info(CALLER_ID, string.Format("Valid Open-Meteo forecast data ready in memory for (%1, %2). Starting live weather cycle.",
				m_fLatitude.ToString(2), m_fLongitude.ToString(2)));
			StartOpenMeteoCycle();
		}
		else
		{
			// Data not ready yet -> start temporary fallback provider and request fetch
			DebugLog.Info(CALLER_ID, "Open-Meteo forecast data pending. Activating temporary fallback provider...");
			ActivateFallbackProvider();

			if (pFetchService)
				pFetchService.StartFetching(m_fLatitude, m_fLongitude);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Activates temporary Markov-chain fallback provider while waiting for network data
	protected void ActivateFallbackProvider()
	{
		if (m_bIsFallbackActive && m_pFallbackProvider)
			return;

		m_bIsFallbackActive = true;
		m_pFallbackProvider = new BPR_WeatherProviderSimple();
		m_pFallbackProvider.Init("Cloudy", 0, 0);

		DebugLog.Info(CALLER_ID, "Fallback weather provider active.");
	}

	//------------------------------------------------------------------------------------------------
	//! Deactivates temporary fallback provider once Open-Meteo data arrives
	protected void DeactivateFallbackProvider()
	{
		if (!m_bIsFallbackActive)
			return;

		m_bIsFallbackActive = false;
		if (m_pFallbackProvider)
		{
			m_pFallbackProvider.Cleanup();
			m_pFallbackProvider = null;
		}

		DebugLog.Info(CALLER_ID, "Fallback provider deactivated. Handing over to Open-Meteo live weather.");
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker listener: Invoked when BPR_FetchOpenMeteoData finishes updating
	protected void OnWeatherDataReceived(bool bSuccess)
	{
		if (!m_bIsInitialized)
			return;

		if (bSuccess && BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Info(CALLER_ID, "New Open-Meteo weather dataset received.");
			if (m_bIsFallbackActive)
			{
				DeactivateFallbackProvider();
				StartOpenMeteoCycle();
			}
			else
			{
				// Refresh active transition with updated forecasts
				PerformWeatherTransition();
			}
		}
		else
		{
			DebugLog.Warn(CALLER_ID, "Open-Meteo update failed or empty. Ensuring fallback provider remains active.");
			if (!m_bIsFallbackActive)
				ActivateFallbackProvider();
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Starts autonomous Open-Meteo 15-minute glide cycle
	protected void StartOpenMeteoCycle()
	{
		if (!BPR_FetchOpenMeteoData.HasValidData())
		{
			ActivateFallbackProvider();
			return;
		}

		int iYear, iMonth, iDay, iHour, iMinute, iSecond;
		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = CalculateIntervalIndex(iHour, iMinute);

		float fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH;
		float fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure;
		int iWeatherCode;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iCurrentIntervalIndex, fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH, iWeatherCode, fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure))
		{
			DebugLog.Warn(CALLER_ID, string.Format("Failed to retrieve current interval index %1. Fallback active.", iCurrentIntervalIndex));
			ActivateFallbackProvider();
			return;
		}

		// 1. Resolve current state and apply immediately to Enfusion Engine (1 sec blend)
		m_sCurrentWeatherState = ResolveWeatherState(fCloudCoverPercent, fPrecipitation, iWeatherCode, fWindGustKmH);
		m_pWeatherMgr.ForceWeatherTo(false, m_sCurrentWeatherState, 1.0, 1.0);

		// Synchronize Temperature Manager
		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		if (pTempMgr)
		{
			pTempMgr.StartSimulation(m_sCurrentWeatherState);
			pTempMgr.NotifyWeatherStateChanged(m_sCurrentWeatherState);
		}

		// 2. Start and configure Wind Dynamics Processor
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
		{
			pWindProc.Start();
			pWindProc.SetTargetWindKmH(fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH);
		}

		// 3. Evaluate initial fog density
		EvaluateDynamicFog(fVisibilityMeters, fRelativeHumidity, iWeatherCode, 2.0);

		// Track precipitation history
		if (fPrecipitation > 0.05)
			m_bHadRecentRain = true;

		DebugLog.Info(CALLER_ID, string.Format("Open-Meteo live weather started: State='%1', Temp=%2°C, Clouds=%3%%, Rain=%4mm, Wind=%5km/h.",
			m_sCurrentWeatherState, fTemperature.ToString(1), fCloudCoverPercent.ToString(0), fPrecipitation.ToString(1), fWindSpeedKmH.ToString(0)));

		// 4. Schedule first transition towards the next 15-minute forecast target
		ScheduleNextIntervalTransition(iMinute, iSecond);
	}

	//------------------------------------------------------------------------------------------------
	//! Schedules transition timer to synchronize with the in-game 15-minute clock
	protected void ScheduleNextIntervalTransition(int iMinute, int iSecond)
	{
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		// Calculate remaining seconds in current 15-minute interval
		int iMinutesRemainingInInterval = 15 - (iMinute % 15);
		int iSecondsRemainingInInterval = (iMinutesRemainingInInterval * 60) - iSecond;

		int iTimerMs = Math.Max(2000, iSecondsRemainingInInterval * 1000);

		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iTimerMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Performs 15-minute transition towards the next forecast interval
	protected void PerformWeatherTransition()
	{
		if (!m_bIsInitialized)
			return;

		if (!BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Warn(CALLER_ID, "No valid Open-Meteo data for next transition. Switching to fallback.");
			ActivateFallbackProvider();
			return;
		}

		int iYear, iMonth, iDay, iHour, iMinute, iSecond;
		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = CalculateIntervalIndex(iHour, iMinute);
		int iNextIntervalIndex = iCurrentIntervalIndex + 1;

		int iDataCount = BPR_FetchOpenMeteoData.GetDataCount();
		if (iNextIntervalIndex >= iDataCount)
			iNextIntervalIndex = iCurrentIntervalIndex;

		float fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH;
		float fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure;
		int iWeatherCode;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iNextIntervalIndex, fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH, iWeatherCode, fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure))
		{
			DebugLog.Warn(CALLER_ID, "Failed to retrieve next weather interval. Activating fallback.");
			ActivateFallbackProvider();
			return;
		}

		// 1. Determine target weather state from 15-minute forecast
		string sTargetState = ResolveWeatherState(fCloudCoverPercent, fPrecipitation, iWeatherCode, fWindGustKmH);

		// 2. Calculate dynamic transition and hold times
		float fTotalCycleSeconds = 15.0 * 60.0; // 15-minute cycle duration

		// Base transition duration: ~10 minutes with organic jitter (±1.5 min)
		float fJitterMinutes = Math.RandomFloat(-1.5, 1.5);
		float fTransitionMinutes = Math.Clamp(10.0 + fJitterMinutes, 6.0, 13.0);

		// Thunderstorm fronts roll in faster with squalls
		if (sTargetState.Contains("Thunder"))
		{
			fTransitionMinutes = Math.RandomFloat(3.0, 5.0);
			DebugLog.Info(CALLER_ID, string.Format("Thunderstorm front approaching in Open-Meteo forecast! Accelerated blend: %1 min.", fTransitionMinutes.ToString(1)));
		}

		float fTransitionDurationSeconds = fTransitionMinutes * 60.0;
		float fHoldDurationSeconds = Math.Max(10.0, fTotalCycleSeconds - fTransitionDurationSeconds);

		// 3. Apply smooth blend to Enfusion Engine
		m_pWeatherMgr.ForceWeatherTo(false, sTargetState, fTransitionDurationSeconds, fHoldDurationSeconds);

		// Synchronize Temperature Manager
		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		if (pTempMgr)
			pTempMgr.NotifyWeatherStateChanged(sTargetState);

		// 4. Update Wind Processor with target wind and gusts
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
			pWindProc.SetTargetWindKmH(fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH);

		// 5. Evaluate Fog based on visibility and humidity
		EvaluateDynamicFog(fVisibilityMeters, fRelativeHumidity, iWeatherCode, fTransitionMinutes);

		// Track precipitation
		if (fPrecipitation > 0.05)
			m_bHadRecentRain = true;

		DebugLog.Info(CALLER_ID, string.Format("Glide Transition: '%1' -> '%2' (Clouds: %3%%, Rain: %4mm, Wind: %5km/h, Visibility: %6m).",
			m_sCurrentWeatherState, sTargetState, fCloudCoverPercent.ToString(0), fPrecipitation.ToString(1), fWindSpeedKmH.ToString(0), fVisibilityMeters.ToString(0)));

		m_sCurrentWeatherState = sTargetState;

		// 6. Schedule next 15-minute cycle tick
		int iNextCycleMs = Math.Round(fTotalCycleSeconds * 1000.0);
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);
		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iNextCycleMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Maps cloud cover, precipitation, WMO code, and wind gusts to an authentic Enfusion weather state
	protected string ResolveWeatherState(float fCloudCover, float fPrecipitation, int iWeatherCode, float fWindGust)
	{
		// 1. Thunderstorm Evaluation (WMO 95: Slight/Mod, 96: Hail, 99: Severe Hail)
		bool bIsThunderstorm = (iWeatherCode == 95 || iWeatherCode == 96 || iWeatherCode == 99);

		if (bIsThunderstorm)
		{
			// Cloud family selection
			string sCloudFamily = "Broken";
			if (fCloudCover < 50.0)
				sCloudFamily = "Cloudy";
			else if (fCloudCover >= 85.0)
				sCloudFamily = "Overcast";

			// Intensity selection
			if (fPrecipitation < 0.2)
				return string.Format("%1ThunderDry", sCloudFamily);

			if (iWeatherCode == 99 || fWindGust >= 65.0 || fPrecipitation >= 8.0)
				return string.Format("%1ThunderExtreme", sCloudFamily);

			return string.Format("%1ThunderStrong", sCloudFamily);
		}

		// 2. Standard Cloud Family Base
		string sBaseFamily = "Clear";
		if (fCloudCover >= 90.0)
			sBaseFamily = "Overcast";
		else if (fCloudCover >= 70.0)
			sBaseFamily = "Broken";
		else if (fCloudCover >= 40.0)
			sBaseFamily = "Cloudy";
		else if (fCloudCover >= 15.0)
			sBaseFamily = "Few";
		else
			sBaseFamily = "Clear";

		// 3. Precipitation Intensity Mapping
		// Dry
		if (fPrecipitation < 0.1)
			return sBaseFamily;

		// Light Rain / Drizzle (0.1 - 1.5 mm/h)
		if (fPrecipitation < 1.5)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few")
				return "FewDrizzle";
			if (sBaseFamily == "Cloudy")
				return "CloudyDrizzle";
			if (sBaseFamily == "Broken")
				return "BrokenNormal";
			return "OvercastNormal";
		}

		// Moderate / Normal Rain (1.5 - 5.0 mm/h)
		if (fPrecipitation < 5.0)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few")
				return "FewNormal";
			if (sBaseFamily == "Cloudy")
				return "CloudyNormal";
			if (sBaseFamily == "Broken")
				return "BrokenNormal";
			return "OvercastNormal";
		}

		// Heavy Rain (5.0 - 10.0 mm/h)
		if (fPrecipitation < 10.0)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few" || sBaseFamily == "Cloudy")
				return "CloudyStrong";
			if (sBaseFamily == "Broken")
				return "BrokenStrong";
			return "OvercastStrong";
		}

		// Extreme Storm Rain (> 10.0 mm/h)
		if (sBaseFamily == "Overcast" || fWindGust >= 55.0)
			return "Rainy";

		return "BrokenExtreme";
	}

	//------------------------------------------------------------------------------------------------
	//! Dynamically evaluates atmospheric fog based on physical visibility and relative humidity
	protected void EvaluateDynamicFog(float fVisibilityMeters, float fRelativeHumidity, int iWeatherCode, float fBlendMinutes)
	{
		BPR_FogDynamicsProcessor pFogProcessor = BPR_FogDynamicsProcessor.GetInstance();
		if (!pFogProcessor)
			return;

		float fFogDensity = 0.0;

		// WMO 45 (Fog) or WMO 48 (Depositing rime fog)
		if (iWeatherCode == 45 || iWeatherCode == 48)
		{
			if (fVisibilityMeters < 500.0)
				fFogDensity = 0.80;
			else if (fVisibilityMeters < 1000.0)
				fFogDensity = 0.60;
			else
				fFogDensity = 0.45;
		}
		else
		{
			// Physical visibility curve combined with humidity saturation
			if (fVisibilityMeters >= 10000.0)
			{
				fFogDensity = 0.0;
			}
			else if (fVisibilityMeters >= 5000.0)
			{
				// Light haze (5% - 10%)
				fFogDensity = 0.05 + (((10000.0 - fVisibilityMeters) / 5000.0) * 0.05);
			}
			else if (fVisibilityMeters >= 2000.0)
			{
				// Mist (10% - 25%)
				fFogDensity = 0.10 + (((5000.0 - fVisibilityMeters) / 3000.0) * 0.15);
			}
			else if (fVisibilityMeters >= 1000.0)
			{
				// Light fog (25% - 40%)
				fFogDensity = 0.25 + (((2000.0 - fVisibilityMeters) / 1000.0) * 0.15);
			}
			else if (fVisibilityMeters >= 500.0)
			{
				// Moderate ground fog (40% - 65%)
				fFogDensity = 0.40 + (((1000.0 - fVisibilityMeters) / 500.0) * 0.25);
			}
			else
			{
				// Dense fog (< 500m: 65% - 95%)
				fFogDensity = 0.65 + (((500.0 - Math.Max(0.0, fVisibilityMeters)) / 500.0) * 0.30);
			}

			// Humidity threshold: Low humidity (<65%) indicates dry dust/smog rather than water droplet fog
			if (fRelativeHumidity < 65.0)
			{
				fFogDensity = 0.0;
			}
			else if (fRelativeHumidity < 85.0)
			{
				float fHumidityFactor = Math.Clamp((fRelativeHumidity - 65.0) / 20.0, 0.0, 1.0);
				fFogDensity *= fHumidityFactor;
			}
		}

		pFogProcessor.SetTargetFogDensity(fFogDensity, fBlendMinutes * 60.0);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates interval index (0 to 191) for current in-game hour and minute
	protected int CalculateIntervalIndex(int iHour, int iMinute)
	{
		int iClampedHour = Math.Clamp(iHour, 0, 23);
		int iClampedMinute = Math.Clamp(iMinute, 0, 59);

		return (iClampedHour * 4) + (iClampedMinute / 15);
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves current in-game date and time
	protected void GetInGameDateTime(out int iYear, out int iMonth, out int iDay, out int iHour, out int iMinute, out int iSecond)
	{
		iYear = 2026;
		iMonth = 7;
		iDay = 15;
		iHour = 12;
		iMinute = 0;
		iSecond = 0;

		if (!m_pWeatherMgr)
			m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);

		if (m_pWeatherMgr)
		{
			m_pWeatherMgr.GetDate(iYear, iMonth, iDay);
			m_pWeatherMgr.GetHoursMinutesSeconds(iHour, iMinute, iSecond);
		}
	}

	// --- Getters & Queries ---
	string GetCurrentState() { return m_sCurrentWeatherState; }
	bool HadRecentRain() { return m_bHadRecentRain; }
	bool IsFallbackActive() { return m_bIsFallbackActive; }

	//------------------------------------------------------------------------------------------------
	//! Cleans up active weather timers, listeners, and fallback modules
	void Cleanup()
	{
		DebugLog.Info(CALLER_ID, "Cleaning up Open-Meteo Weather Provider...");

		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
		if (pFetchService && pFetchService.GetOnWeatherDataUpdated())
			pFetchService.GetOnWeatherDataUpdated().Remove(OnWeatherDataReceived);

		if (m_pFallbackProvider)
		{
			m_pFallbackProvider.Cleanup();
			m_pFallbackProvider = null;
		}

		m_bIsInitialized = false;
		m_bIsFallbackActive = false;
	}
};
