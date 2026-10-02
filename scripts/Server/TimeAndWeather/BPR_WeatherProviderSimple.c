// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherProviderSimple.c
// Author: Indy & AI Assistant
// Description: Server-side Simple Weather Provider (Mode 2) for Boiling Point Reforger.
//              - Manages 24 distinct weather states defined in WeatherStates.conf.
//              - Weighted Markov-chain transition matrix influenced by dynamic
//                seasonal and climate zone tendency multipliers.
//              - Realistic wind simulation with seasonal scaling, gusts, squalls,
//                and special phenomena such as warm summer rain calms (Regen bei Flaute).
//              - Atmospheric fog dynamics driven by sun phase and weather history
//                (morning mist, post-rain evaporation fog, autumn inversion daylight fog,
//                and summer heat haze).
//              - Convective thunderstorm outbreaks during afternoon heating.
//              - Supports option 0 (Random) for transitions and duration with ±1/3 jitter.
//              - Synchronizes with BPR_TemperatureManager and engine native overrides.
// ============================================================================

// ----------------------------------------------------------------------------
//! Transition node holding a candidate target state and its base weight
// ----------------------------------------------------------------------------
class BPR_WeatherTransitionNode
{
	string m_sTargetState;
	int m_iWeight;

	void BPR_WeatherTransitionNode(string sTargetState, int iWeight)
	{
		m_sTargetState = sTargetState;
		m_iWeight = iWeight;
	}
};

// ----------------------------------------------------------------------------
//! Weather state profile holding transitions, wind characteristics, and precipitation flags
// ----------------------------------------------------------------------------
class BPR_WeatherStateProfile
{
	string m_sStateName;
	ref array<ref BPR_WeatherTransitionNode> m_aTransitions;
	float m_fMinWindSpeed;
	float m_fMaxWindSpeed;
	float m_fGustMultiplier;
	bool m_bHasRain;
	bool m_bIsThunder;

	void BPR_WeatherStateProfile(string sStateName, float fMinWind, float fMaxWind, float fGustMult, bool bRain, bool bThunder)
	{
		m_sStateName = sStateName;
		m_aTransitions = new array<ref BPR_WeatherTransitionNode>();
		m_fMinWindSpeed = fMinWind;
		m_fMaxWindSpeed = fMaxWind;
		m_fGustMultiplier = fGustMult;
		m_bHasRain = bRain;
		m_bIsThunder = bThunder;
	}

	void AddTransition(string sTargetState, int iWeight)
	{
		m_aTransitions.Insert(new BPR_WeatherTransitionNode(sTargetState, iWeight));
	}
};

// ----------------------------------------------------------------------------
//! Main Simple Weather Provider Class (Mode 2)
// ----------------------------------------------------------------------------
class BPR_WeatherProviderSimple
{
	const static string CALLER_ID = "WeProSim";

	protected bool m_bIsInitialized;
	protected string m_sCurrentWeatherState;
	protected int m_iWeatherTransition; // 0=Random, 1=Never, 2=60m, 3=30m, 4=10m
	protected int m_iTransitionTime;    // 0=Random, 1=30m, 2=15m, 3=7.5m, 4=5m

	protected float m_fCurrentWindDirection;
	protected bool m_bHadRecentRain;
	protected int m_iRecentRainStateCounter;

	protected TimeAndWeatherManagerEntity m_pWeatherMgr;
	protected ref map<string, ref BPR_WeatherStateProfile> m_mProfiles;

	//------------------------------------------------------------------------------------------------
	//! Initializes Simple Weather Provider, builds transition matrix, and launches weather cycle
	void Init(string sStartWeatherState, int iWeatherTransition, int iTransitionTime)
	{
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		m_sCurrentWeatherState = sStartWeatherState;
		m_iWeatherTransition = iWeatherTransition;
		m_iTransitionTime = iTransitionTime;
		m_fCurrentWindDirection = Math.RandomFloat(0.0, 360.0);
		m_bHadRecentRain = false;
		m_iRecentRainStateCounter = 0;

		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "TimeAndWeatherManagerEntity not found! Simple Weather cannot start.");
			return;
		}

		// 1. Build State Transition Matrix for all 24 Weather States
		BuildWeatherProfiles();

		// Validate start state against profile registry
		if (!m_mProfiles.Contains(m_sCurrentWeatherState))
		{
			DebugLog.Warn(CALLER_ID, string.Format("Unknown start weather state '%1'. Defaulting to 'Clear'.", m_sCurrentWeatherState));
			m_sCurrentWeatherState = "Clear";
		}

		// 2. Apply Initial Weather State directly to Enfusion Engine (no generic preset mapping)
		m_pWeatherMgr.ForceWeatherTo(false, m_sCurrentWeatherState, 0.0, 0.0);

		// Synchronize with Temperature Manager
		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		if (pTempMgr)
		{
			pTempMgr.StartSimulation(m_sCurrentWeatherState);
			pTempMgr.NotifyWeatherStateChanged(m_sCurrentWeatherState);
		}

		// Retrieve date and active climate zone
		int iYear, iMonth, iDay;
		float fHourFloat;
		GetInGameDateTime(iYear, iMonth, iDay, fHourFloat);

		BPR_EClimateZone eZone = BPR_EClimateZone.CONTINENTAL;
		if (pTempMgr)
			eZone = pTempMgr.GetActiveClimateZone();

		// 3. Initialize Wind Dynamics Processor
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
		{
			pWindProc.Start();
			UpdateWindForWeatherState(m_sCurrentWeatherState, 1.0, iMonth, eZone);
		}

		// Track precipitation state
		BPR_WeatherStateProfile pProfile = m_mProfiles.Get(m_sCurrentWeatherState);
		if (pProfile && pProfile.m_bHasRain)
		{
			m_bHadRecentRain = true;
			m_iRecentRainStateCounter = 3;
		}

		// 4. Evaluate initial atmospheric fog gently (avoids frame-0 engine reset)
		EvaluateDynamicFog(m_sCurrentWeatherState, 3.0, iMonth, eZone);

		DebugLog.Info(CALLER_ID, string.Format("Simple Weather Provider initialized. Initial state: '%1' (Transitions: %2, TransitionTime: %3, ClimateZone: %4).",
			m_sCurrentWeatherState, m_iWeatherTransition, m_iTransitionTime, BPR_ClimateProfile.ClimateZoneToString(eZone)));

		// 5. Schedule Autonomous Weather Cycle (if not set to 1 = Never)
		if (m_iWeatherTransition != 1)
		{
			ScheduleNextWeatherTransition();
		}
		else
		{
			DebugLog.Info(CALLER_ID, "WeatherTransitions set to 1 (Never): Weather will remain permanently on initial state.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Schedules the next weather transition timer with randomized duration (±1/3)
	protected void ScheduleNextWeatherTransition()
	{
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		float fStateDurationMinutes = CalculateStateDurationMinutes(m_iWeatherTransition, m_sCurrentWeatherState);
		int iTimerMs = Math.Round(fStateDurationMinutes * 60.0 * 1000.0);

		DebugLog.Info(CALLER_ID, string.Format("Active state '%1' will persist for %2 minutes (%3 ms).",
			m_sCurrentWeatherState, fStateDurationMinutes.ToString(1), iTimerMs));

		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iTimerMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Executes autonomous state transition: selects next state, calculates durations, updates wind and fog
	protected void PerformWeatherTransition()
	{
		if (!m_bIsInitialized || !m_pWeatherMgr)
			return;

		int iYear, iMonth, iDay;
		float fHourFloat;
		GetInGameDateTime(iYear, iMonth, iDay, fHourFloat);

		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		BPR_EClimateZone eZone = BPR_EClimateZone.CONTINENTAL;
		if (pTempMgr)
			eZone = pTempMgr.GetActiveClimateZone();

		// 1. Determine next weather state (standard weighted transition or convective thunderstorm outbreak)
		string sNextState = "";
		bool bIsSpecialStormEvent = CheckThunderstormEventTrigger(sNextState, fHourFloat, iMonth, eZone);

		if (!bIsSpecialStormEvent || sNextState == "")
		{
			sNextState = SelectNextWeatherState(m_sCurrentWeatherState, iMonth, eZone);
		}

		// Handle Stable Weather Persistence (Self-Transition)
		bool bIsStableWeather = (sNextState == m_sCurrentWeatherState);

		// 2. Calculate transition duration in minutes (with ±1/3 jitter)
		float fTransitionDurationMinutes = 0.0;
		if (!bIsStableWeather)
		{
			if (bIsSpecialStormEvent)
			{
				fTransitionDurationMinutes = Math.RandomFloat(2.5, 5.0);
				DebugLog.Info(CALLER_ID, string.Format("Convective Thunderstorm Front rolling in! Accelerated transition time: %1 min.", fTransitionDurationMinutes.ToString(1)));
			}
			else
			{
				fTransitionDurationMinutes = CalculateTransitionDurationMinutes(m_iTransitionTime, sNextState);
			}
		}

		// Calculate hold duration of the next state
		float fNextStateHoldMinutes = CalculateStateDurationMinutes(m_iWeatherTransition, sNextState);

		// 3. Apply weather blend to Enfusion Engine (if state changed)
		if (!bIsStableWeather)
		{
			float fTransitionSeconds = fTransitionDurationMinutes * 60.0;
			float fHoldSeconds = fNextStateHoldMinutes * 60.0;
			m_pWeatherMgr.ForceWeatherTo(false, sNextState, fTransitionSeconds, fHoldSeconds);

			// Synchronize with Temperature Manager
			if (pTempMgr)
				pTempMgr.NotifyWeatherStateChanged(sNextState);
		}
		else
		{
			DebugLog.Info(CALLER_ID, string.Format("Stable Weather persistence: state '%1' remains active for another %2 min.", m_sCurrentWeatherState, fNextStateHoldMinutes.ToString(1)));
		}

		// 4. Update Wind & Gusts for active/new state
		float fWindBlendMinutes = Math.Max(2.0, fTransitionDurationMinutes);
		UpdateWindForWeatherState(sNextState, fWindBlendMinutes, iMonth, eZone);

		// Track rain history for evaporation fog
		BPR_WeatherStateProfile pNextProfile = m_mProfiles.Get(sNextState);
		if (pNextProfile)
		{
			if (pNextProfile.m_bHasRain)
			{
				m_bHadRecentRain = true;
				m_iRecentRainStateCounter = 3;
			}
			else if (m_iRecentRainStateCounter > 0)
			{
				m_iRecentRainStateCounter = m_iRecentRainStateCounter - 1;
				if (m_iRecentRainStateCounter <= 0)
					m_bHadRecentRain = false;
			}
		}

		// 5. Evaluate Atmospheric Fog Events (Morning mist, evaporation fog, autumn daylight inversion)
		float fFogBlendMinutes = Math.Max(2.5, fTransitionDurationMinutes);
		EvaluateDynamicFog(sNextState, fFogBlendMinutes, iMonth, eZone);

		if (!bIsStableWeather)
		{
			DebugLog.Info(CALLER_ID, string.Format("Transitioning: '%1' -> '%2' (Transition: %3 min, Hold: %4 min).",
				m_sCurrentWeatherState, sNextState, fTransitionDurationMinutes.ToString(1), fNextStateHoldMinutes.ToString(1)));
		}

		m_sCurrentWeatherState = sNextState;

		// 6. Schedule next cycle when transition + hold duration expires
		float fTotalCycleMinutes = fTransitionDurationMinutes + fNextStateHoldMinutes;
		int iNextCycleMs = Math.Round(fTotalCycleMinutes * 60.0 * 1000.0);

		GetGame().GetCallqueue().Remove(PerformWeatherTransition);
		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iNextCycleMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates the Markov-chain matrix with dynamic seasonal and climate zone tendency multipliers
	protected string SelectNextWeatherState(string sCurrentState, int iMonth, BPR_EClimateZone eZone)
	{
		BPR_WeatherStateProfile pProfile = m_mProfiles.Get(sCurrentState);
		if (!pProfile || pProfile.m_aTransitions.IsEmpty())
		{
			DebugLog.Warn(CALLER_ID, string.Format("No transitions configured for state '%1'. Fallback to 'Cloudy'.", sCurrentState));
			return "Cloudy";
		}

		// Calculate total weighted score with dynamic tendency factors applied
		float fTotalScore = 0.0;
		ref array<float> aDynamicWeights = new array<float>();

		foreach (BPR_WeatherTransitionNode node : pProfile.m_aTransitions)
		{
			float fTendencyMultiplier = CalculateTendencyMultiplier(node.m_sTargetState, iMonth, eZone);
			float fEffectiveWeight = node.m_iWeight * fTendencyMultiplier;
			if (fEffectiveWeight < 0.1)
				fEffectiveWeight = 0.1;

			aDynamicWeights.Insert(fEffectiveWeight);
			fTotalScore += fEffectiveWeight;
		}

		if (fTotalScore <= 0.0)
			return pProfile.m_aTransitions[0].m_sTargetState;

		float fRoll = Math.RandomFloat(0.0, fTotalScore);
		float fAccumulated = 0.0;

		int iNodeCount = pProfile.m_aTransitions.Count();
		for (int i = 0; i < iNodeCount; i++)
		{
			fAccumulated += aDynamicWeights[i];
			if (fRoll <= fAccumulated)
			{
				return pProfile.m_aTransitions[i].m_sTargetState;
			}
		}

		return pProfile.m_aTransitions[0].m_sTargetState;
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates dynamic tendency factor based on state classification, season (month), and climate zone
	protected float CalculateTendencyMultiplier(string sTargetState, int iMonth, BPR_EClimateZone eZone)
	{
		float fFactor = 1.0;
		string sLower = sTargetState;
		sLower.ToLower();

		bool bIsSunny = (sLower == "clear" || sLower == "few");
		bool bIsCloudy = (sLower == "cloudy" || sLower == "broken");
		bool bIsOvercast = (sLower.Contains("overcast") || sLower.Contains("overkast"));
		bool bIsPrecipitation = (sLower.Contains("drizzle") || sLower.Contains("rain") || sLower.Contains("strong") || sLower.Contains("extreme"));
		bool bIsThunder = sLower.Contains("thunder");

		// --- 1. Seasonal Influence (Northern hemisphere calendar) ---
		// High Summer (June, July, August): dry sunny high pressure, afternoon heat thunder, suppressed gray rain
		if (iMonth >= 6 && iMonth <= 8)
		{
			if (bIsSunny)
				fFactor *= 1.65;
			else if (bIsThunder)
				fFactor *= 1.50;
			else if (bIsPrecipitation)
				fFactor *= 0.55;
			else if (bIsOvercast)
				fFactor *= 0.60;
		}
		// Autumn (September, October, November): cyclonic depressions, frequent rain, persistent overcast
		else if (iMonth >= 9 && iMonth <= 11)
		{
			if (bIsPrecipitation)
				fFactor *= 1.70;
			else if (bIsOvercast)
				fFactor *= 1.55;
			else if (bIsSunny)
				fFactor *= 0.65;
			else if (bIsThunder)
				fFactor *= 0.60;
		}
		// Winter (December, January, February): low insolation, gray overcast, drizzle / cold rain
		else if (iMonth == 12 || iMonth <= 2)
		{
			if (bIsOvercast)
				fFactor *= 1.60;
			else if (bIsPrecipitation)
				fFactor *= 1.35;
			else if (bIsSunny)
				fFactor *= 0.70;
			else if (bIsThunder)
				fFactor *= 0.15; // Very rare winter thunder
		}
		// Spring (March, April, May): dynamic alternating weather (April showers)
		else
		{
			if (bIsCloudy)
				fFactor *= 1.20;
			else if (bIsSunny)
				fFactor *= 1.10;
		}

		// --- 2. Climate Zone Modifier ---
		switch (eZone)
		{
			case BPR_EClimateZone.ARID:
			{
				if (bIsSunny)
					fFactor *= 2.20;
				else if (bIsPrecipitation)
					fFactor *= 0.15;
				else if (bIsThunder && sLower.Contains("dry"))
					fFactor *= 1.75;
				else if (bIsThunder)
					fFactor *= 0.30;
			}
			break;

			case BPR_EClimateZone.MEDITERRANEAN:
			{
				if (iMonth >= 5 && iMonth <= 9)
				{
					if (bIsSunny)
						fFactor *= 1.80;
					else if (bIsPrecipitation)
						fFactor *= 0.35;
				}
				else
				{
					if (bIsPrecipitation)
						fFactor *= 1.25;
				}
			}
			break;

			case BPR_EClimateZone.OCEANIC:
			{
				if (bIsPrecipitation)
					fFactor *= 1.50;
				else if (bIsOvercast)
					fFactor *= 1.40;
				else if (bIsSunny)
					fFactor *= 0.70;
			}
			break;

			case BPR_EClimateZone.TROPICAL:
			{
				if (bIsPrecipitation)
					fFactor *= 1.65;
				else if (bIsThunder)
					fFactor *= 1.90;
			}
			break;

			case BPR_EClimateZone.SUBARCTIC:
			{
				if (bIsOvercast)
					fFactor *= 1.50;
				else if (bIsThunder)
					fFactor *= 0.10;
			}
			break;

			case BPR_EClimateZone.CONTINENTAL:
			default:
				// Continental uses balanced seasonal curve
				break;
		}

		return Math.Clamp(fFactor, 0.05, 5.0);
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates whether conditions trigger a sudden convective thunderstorm event matching active cloud cover
	protected bool CheckThunderstormEventTrigger(out string sThunderState, float fHour, int iMonth, BPR_EClimateZone eZone)
	{
		sThunderState = "";

		// Convective afternoon heating window (13:00 - 19:30)
		bool bAfternoonConvection = (fHour >= 13.0 && fHour <= 19.5);

		float fTriggerChance = 0.04; // Base 4% chance
		if (bAfternoonConvection)
			fTriggerChance = 0.09;

		// Seasonal boost: summer has much higher convective energy
		if (iMonth >= 5 && iMonth <= 8)
			fTriggerChance *= 1.8;
		else if (iMonth >= 11 || iMonth <= 2)
			fTriggerChance *= 0.2; // Winter thunderstorms are very rare

		// Climate zone adjustments
		if (eZone == BPR_EClimateZone.TROPICAL)
			fTriggerChance *= 1.7;
		else if (eZone == BPR_EClimateZone.SUBARCTIC)
			fTriggerChance *= 0.25;

		if (Math.RandomFloat01() > fTriggerChance)
			return false;

		// Match current cloud cover family to logical thunder state
		string sCurrent = m_sCurrentWeatherState;

		if (sCurrent == "Clear" || sCurrent.Contains("Few"))
		{
			sThunderState = "CloudyThunderDry";
			return true;
		}
		else if (sCurrent.Contains("Cloudy"))
		{
			if (sCurrent.Contains("Strong") || sCurrent.Contains("Normal"))
				sThunderState = "CloudyThunderStrong";
			else
				sThunderState = "CloudyThunderDry";
			return true;
		}
		else if (sCurrent.Contains("Broken"))
		{
			if (sCurrent.Contains("Extreme") || sCurrent.Contains("Strong"))
				sThunderState = "BrokenThunderExtreme";
			else if (sCurrent.Contains("Normal"))
				sThunderState = "BrokenThunderStrong";
			else
				sThunderState = "BrokenThunderDry";
			return true;
		}
		else if (sCurrent.Contains("Overcast") || sCurrent == "Rainy")
		{
			if (sCurrent.Contains("Extreme") || sCurrent.Contains("Strong") || sCurrent == "Rainy")
				sThunderState = "OvercastThunderExtreme";
			else if (sCurrent.Contains("Normal"))
				sThunderState = "OvercastThunderStrong";
			else
				sThunderState = "OvercastThunderDry";
			return true;
		}

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! Updates wind speed, gusts, and direction factoring in seasons, climate zones, squalls, and "Regen bei Flaute"
	protected void UpdateWindForWeatherState(string sState, float fTransitionMinutes, int iMonth, BPR_EClimateZone eZone)
	{
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (!pWindProc)
			return;

		BPR_WeatherStateProfile pProfile = m_mProfiles.Get(sState);
		if (!pProfile)
			return;

		float fBaseWindSpeed = Math.RandomFloat(pProfile.m_fMinWindSpeed, pProfile.m_fMaxWindSpeed);
		float fGustMultiplier = pProfile.m_fGustMultiplier;

		// 1. Seasonal Wind Scaling
		// Autumn & Spring: higher winds and stormy weather (+25%)
		if ((iMonth >= 9 && iMonth <= 11) || (iMonth >= 3 && iMonth <= 4))
		{
			fBaseWindSpeed *= 1.25;
			fGustMultiplier = Math.Min(2.2, fGustMultiplier * 1.10);
		}
		// High Summer: calmer general winds (-10%)
		else if (iMonth >= 6 && iMonth <= 8)
		{
			fBaseWindSpeed *= 0.90;
		}

		// 2. Climate Zone Wind Influence
		if (eZone == BPR_EClimateZone.OCEANIC)
		{
			fBaseWindSpeed *= 1.30; // Coastal oceanic wind is consistently stronger
		}
		else if (eZone == BPR_EClimateZone.ARID)
		{
			fBaseWindSpeed *= 1.15; // Thermal desert gusts
		}

		// 3. Special Phenomenon: "Regen bei Flaute" (Warm calm summer rain / steady drizzle)
		// During summer months or light drizzle, 30% chance for a wind lull with gentle drizzle
		if ((iMonth >= 6 && iMonth <= 8) && (sState == "FewDrizzle" || sState == "CloudyDrizzle" || sState == "FewNormal"))
		{
			if (Math.RandomFloat01() < 0.35)
			{
				fBaseWindSpeed = Math.RandomFloat(0.6, 2.0); // Gentle breeze to calm
				fGustMultiplier = 1.20;
				DebugLog.Info(CALLER_ID, "Atmospheric Phenomenon: 'Regen bei Flaute' triggered (Calm summer precipitation).");
			}
		}

		// 4. Directional Shift
		// Standard shifts: ±15..30°, Frontal & thunderstorms: ±45..80°
		float fShiftDelta = Math.RandomFloat(-25.0, 25.0);
		if (pProfile.m_bIsThunder || sState.Contains("Extreme") || sState.Contains("Strong"))
		{
			fShiftDelta = Math.RandomFloat(-75.0, 75.0);
			fGustMultiplier = Math.Max(fGustMultiplier, 1.85); // Violent squall line gusts
		}

		m_fCurrentWindDirection = NormalizeAngle(m_fCurrentWindDirection + fShiftDelta);

		float fTargetGustSpeed = fBaseWindSpeed * fGustMultiplier;
		pWindProc.SetTargetWindMs(fBaseWindSpeed, m_fCurrentWindDirection, fTargetGustSpeed);
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates dynamic atmospheric fog events (Morning mist, evaporation fog, autumn daylight inversion)
	protected void EvaluateDynamicFog(string sWeatherState, float fTransitionMinutes, int iMonth, BPR_EClimateZone eZone)
	{
		BPR_FogDynamicsProcessor pFogProc = BPR_FogDynamicsProcessor.GetInstance();
		if (!pFogProc)
			return;

		float fTimeOfDay = m_pWeatherMgr.GetTimeOfTheDay();
		float fSunrise = BPR_SunUtility.GetSunriseHour();
		bool bIsDay = BPR_SunUtility.IsDay();
		bool bIsDawn = BPR_SunUtility.IsDawn();

		float fWindSpeed = 3.0;
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
			fWindSpeed = pWindProc.GetActiveSpeedMs();

		float fTargetFog = 0.0;

		// 1. Post-Rain Evaporation Fog (Dampfnebel / Sommer-Frühnebel)
		// Occurs when rain was recent and morning sun heats the wet ground
		if (m_bHadRecentRain && bIsDay && (fTimeOfDay >= fSunrise && fTimeOfDay <= fSunrise + 3.0))
		{
			fTargetFog = Math.RandomFloat(0.40, 0.70);
			DebugLog.Info(CALLER_ID, string.Format("Atmospheric Event: Post-Rain Evaporation Fog triggered (Target: %1).", fTargetFog.ToString(2)));
		}
		// 2. Morning Radiation Valley Mist (Morgen-Strahlungsnebel)
		// Occurs at dawn/sunrise under calm wind (< 3.8 m/s) and clear/few sky
		else if (bIsDawn || (fTimeOfDay >= fSunrise - 0.5 && fTimeOfDay <= fSunrise + 1.2))
		{
			if (fWindSpeed < 3.8 && (sWeatherState == "Clear" || sWeatherState.Contains("Few") || sWeatherState == "Cloudy"))
			{
				fTargetFog = Math.RandomFloat(0.35, 0.65);
				DebugLog.Info(CALLER_ID, string.Format("Atmospheric Event: Morning Radiation Mist triggered (Target: %1).", fTargetFog.ToString(2)));
			}
		}
		// 3. Autumn & Winter Daylight Stratus Inversion Fog (Ganztägiger Inversionsnebel)
		// Months 9-12 and 1-2 under Overcast / Broken skies with wind < 5.5 m/s
		else if ((iMonth >= 9 || iMonth <= 2) && (sWeatherState.Contains("Overcast") || sWeatherState.Contains("Broken")))
		{
			if (fWindSpeed < 5.5)
			{
				fTargetFog = Math.RandomFloat(0.25, 0.55);
				DebugLog.Info(CALLER_ID, string.Format("Atmospheric Event: Autumn Daylight Inversion Fog triggered (Target: %1).", fTargetFog.ToString(2)));
			}
		}
		// 4. Heavy Rain Squall Spray & Mountain Cloud Mist
		else if (sWeatherState.Contains("Extreme") || sWeatherState.Contains("ThunderStrong") || sWeatherState.Contains("ThunderExtreme") || sWeatherState == "Rainy")
		{
			fTargetFog = Math.RandomFloat(0.18, 0.35);
		}
		// 5. Summer Heat Haze (Hitzedunst bei intensiver Sommersonne)
		else if ((iMonth >= 6 && iMonth <= 8) && sWeatherState == "Clear" && (fTimeOfDay >= 11.5 && fTimeOfDay <= 15.5))
		{
			fTargetFog = Math.RandomFloat(0.08, 0.14);
		}
		// 6. Normal Dry Clearing
		else
		{
			fTargetFog = 0.0;
		}

		float fTransitionDurationSec = fTransitionMinutes * 60.0;
		pFogProc.SetTargetFogDensity(fTargetFog, fTransitionDurationSec);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates weather state duration in minutes (0=Random, 1=Never, 2=60m, 3=30m, 4=10m) with ±1/3 jitter
	protected float CalculateStateDurationMinutes(int iSetting, string sState = "")
	{
		if (iSetting == 1)
			return 0.0; // Never

		int iChosenSetting = iSetting;
		if (iChosenSetting == 0)
		{
			// Option 0: Randomly pick tier 2 (60m), 3 (30m), or 4 (10m)
			iChosenSetting = Math.RandomIntInclusive(2, 4);
		}

		float fBaseMinutes = 30.0;
		switch (iChosenSetting)
		{
			case 2: fBaseMinutes = 60.0; break;
			case 3: fBaseMinutes = 30.0; break;
			case 4: fBaseMinutes = 10.0; break;
			default:
				if (iChosenSetting >= 15)
					fBaseMinutes = iChosenSetting;
				break;
		}

		// Extreme convective storm cells & violent thunder pass through faster (10 to 20 minutes)
		if (sState != "" && (sState.Contains("Thunder") || sState.Contains("Extreme")))
		{
			if (fBaseMinutes > 15.0)
				fBaseMinutes = 15.0; // 15 min base -> 10.0 to 20.0 minutes with jitter
		}

		// Jitter of ± 1/3
		float fDelta = fBaseMinutes / 3.0;
		float fMin = Math.Max(2.0, fBaseMinutes - fDelta);
		float fMax = fBaseMinutes + fDelta;

		return Math.RandomFloat(fMin, fMax);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates transition duration in minutes (0=Random, 1=30m, 2=15m, 3=7.5m, 4=5m) with ±1/3 jitter
	protected float CalculateTransitionDurationMinutes(int iSetting, string sTargetState = "")
	{
		// Rapid arrival for severe thunderstorm fronts
		if (sTargetState != "" && (sTargetState.Contains("Thunder") || sTargetState.Contains("Extreme")))
		{
			return Math.RandomFloat(2.5, 5.0);
		}

		int iChosenSetting = iSetting;
		if (iChosenSetting == 0)
		{
			// Option 0: Randomly pick tier 1 (30m), 2 (15m), 3 (7.5m), or 4 (5m)
			iChosenSetting = Math.RandomIntInclusive(1, 4);
		}

		float fBaseMinutes = 15.0;
		switch (iChosenSetting)
		{
			case 1: fBaseMinutes = 30.0; break;
			case 2: fBaseMinutes = 15.0; break;
			case 3: fBaseMinutes = 7.5;  break;
			case 4: fBaseMinutes = 5.0;  break;
			default:
				if (iChosenSetting >= 5)
					fBaseMinutes = iChosenSetting;
				break;
		}

		// Jitter of ± 1/3
		float fDelta = fBaseMinutes / 3.0;
		float fMin = Math.Max(1.0, fBaseMinutes - fDelta);
		float fMax = fBaseMinutes + fDelta;

		return Math.RandomFloat(fMin, fMax);
	}

	//------------------------------------------------------------------------------------------------
	//! Normalizes an angle into the 0.0 <= angle < 360.0 range
	protected float NormalizeAngle(float fAngle)
	{
		float fNorm = fAngle;
		while (fNorm < 0.0)
			fNorm += 360.0;
		while (fNorm >= 360.0)
			fNorm -= 360.0;
		return fNorm;
	}

	//------------------------------------------------------------------------------------------------
	//! Helper to retrieve current in-game date and time
	protected void GetInGameDateTime(out int iYear, out int iMonth, out int iDay, out float fHourFloat)
	{
		iYear = 2026;
		iMonth = 6;
		iDay = 15;
		int iHour = 12;
		int iMinute = 0;
		int iSecond = 0;

		if (m_pWeatherMgr)
		{
			m_pWeatherMgr.GetDate(iYear, iMonth, iDay);
			m_pWeatherMgr.GetHoursMinutesSeconds(iHour, iMinute, iSecond);
		}

		fHourFloat = iHour + (iMinute / 60.0);
	}

	//------------------------------------------------------------------------------------------------
	//! Builds the complete profile registry and rich weighted transition matrix for all 24 states
	protected void BuildWeatherProfiles()
	{
		m_mProfiles = new map<string, ref BPR_WeatherStateProfile>();

		// --- 1. Clear Family ---
		// Clear: Light breeze (1.0-3.5 m/s), Gusts: 1.3x
		ref BPR_WeatherStateProfile pClear = new BPR_WeatherStateProfile("Clear", 1.0, 3.5, 1.30, false, false);
		pClear.AddTransition("Clear", 30);            // Stable weather persistence
		pClear.AddTransition("Few", 35);
		pClear.AddTransition("Cloudy", 15);
		pClear.AddTransition("FewNormal", 10);
		pClear.AddTransition("Broken", 5);
		pClear.AddTransition("CloudyThunderDry", 5);   // Convective summer heat thunder
		m_mProfiles.Insert("Clear", pClear);

		// --- 2. Few Family ---
		// Few: 1.5-4.5 m/s
		ref BPR_WeatherStateProfile pFew = new BPR_WeatherStateProfile("Few", 1.5, 4.5, 1.35, false, false);
		pFew.AddTransition("Few", 25);                // Stable persistence
		pFew.AddTransition("Clear", 30);
		pFew.AddTransition("FewDrizzle", 20);
		pFew.AddTransition("Cloudy", 15);
		pFew.AddTransition("FewNormal", 10);
		pFew.AddTransition("CloudyThunderDry", 5);
		m_mProfiles.Insert("Few", pFew);

		// FewDrizzle: 2.0-5.0 m/s, Rain
		ref BPR_WeatherStateProfile pFewDrizzle = new BPR_WeatherStateProfile("FewDrizzle", 2.0, 5.0, 1.40, true, false);
		pFewDrizzle.AddTransition("FewDrizzle", 20);
		pFewDrizzle.AddTransition("Few", 30);
		pFewDrizzle.AddTransition("FewNormal", 25);
		pFewDrizzle.AddTransition("CloudyDrizzle", 15);
		pFewDrizzle.AddTransition("Clear", 10);
		m_mProfiles.Insert("FewDrizzle", pFewDrizzle);

		// FewNormal: 2.5-5.5 m/s, Rain
		ref BPR_WeatherStateProfile pFewNormal = new BPR_WeatherStateProfile("FewNormal", 2.5, 5.5, 1.45, true, false);
		pFewNormal.AddTransition("FewNormal", 20);
		pFewNormal.AddTransition("Few", 25);
		pFewNormal.AddTransition("FewDrizzle", 25);
		pFewNormal.AddTransition("CloudyNormal", 20);
		pFewNormal.AddTransition("Clear", 10);
		m_mProfiles.Insert("FewNormal", pFewNormal);

		// --- 3. Cloudy Family ---
		// Cloudy: 2.5-6.0 m/s
		ref BPR_WeatherStateProfile pCloudy = new BPR_WeatherStateProfile("Cloudy", 2.5, 6.0, 1.40, false, false);
		pCloudy.AddTransition("Cloudy", 25);          // Stable persistence
		pCloudy.AddTransition("Few", 25);
		pCloudy.AddTransition("Broken", 20);
		pCloudy.AddTransition("CloudyDrizzle", 15);
		pCloudy.AddTransition("CloudyNormal", 10);
		pCloudy.AddTransition("CloudyThunderDry", 5);
		m_mProfiles.Insert("Cloudy", pCloudy);

		// CloudyDrizzle: 3.0-6.5 m/s, Rain
		ref BPR_WeatherStateProfile pCloudyDrizzle = new BPR_WeatherStateProfile("CloudyDrizzle", 3.0, 6.5, 1.45, true, false);
		pCloudyDrizzle.AddTransition("CloudyDrizzle", 25);
		pCloudyDrizzle.AddTransition("Cloudy", 30);
		pCloudyDrizzle.AddTransition("CloudyNormal", 25);
		pCloudyDrizzle.AddTransition("BrokenNormal", 15);
		pCloudyDrizzle.AddTransition("FewDrizzle", 5);
		m_mProfiles.Insert("CloudyDrizzle", pCloudyDrizzle);

		// CloudyNormal: 4.0-7.5 m/s, Rain
		ref BPR_WeatherStateProfile pCloudyNormal = new BPR_WeatherStateProfile("CloudyNormal", 4.0, 7.5, 1.50, true, false);
		pCloudyNormal.AddTransition("CloudyNormal", 25);
		pCloudyNormal.AddTransition("Cloudy", 25);
		pCloudyNormal.AddTransition("CloudyStrong", 20);
		pCloudyNormal.AddTransition("BrokenNormal", 20);
		pCloudyNormal.AddTransition("CloudyThunderStrong", 10);
		m_mProfiles.Insert("CloudyNormal", pCloudyNormal);

		// CloudyStrong: 6.0-10.0 m/s, Heavy Rain
		ref BPR_WeatherStateProfile pCloudyStrong = new BPR_WeatherStateProfile("CloudyStrong", 6.0, 10.0, 1.60, true, false);
		pCloudyStrong.AddTransition("CloudyStrong", 20);
		pCloudyStrong.AddTransition("CloudyNormal", 35);
		pCloudyStrong.AddTransition("BrokenStrong", 25);
		pCloudyStrong.AddTransition("CloudyThunderStrong", 15);
		pCloudyStrong.AddTransition("OvercastStrong", 5);
		m_mProfiles.Insert("CloudyStrong", pCloudyStrong);

		// --- 4. Broken Family ---
		// Broken: 3.0-7.0 m/s
		ref BPR_WeatherStateProfile pBroken = new BPR_WeatherStateProfile("Broken", 3.0, 7.0, 1.45, false, false);
		pBroken.AddTransition("Broken", 25);          // Stable persistence
		pBroken.AddTransition("Cloudy", 30);
		pBroken.AddTransition("BrokenNormal", 20);
		pBroken.AddTransition("Overcast", 15);
		pBroken.AddTransition("BrokenThunderDry", 5);
		pBroken.AddTransition("Clear", 5);
		m_mProfiles.Insert("Broken", pBroken);

		// BrokenNormal: 4.5-8.5 m/s, Rain
		ref BPR_WeatherStateProfile pBrokenNormal = new BPR_WeatherStateProfile("BrokenNormal", 4.5, 8.5, 1.55, true, false);
		pBrokenNormal.AddTransition("BrokenNormal", 25);
		pBrokenNormal.AddTransition("Broken", 25);
		pBrokenNormal.AddTransition("BrokenStrong", 25);
		pBrokenNormal.AddTransition("OvercastNormal", 15);
		pBrokenNormal.AddTransition("CloudyNormal", 10);
		m_mProfiles.Insert("BrokenNormal", pBrokenNormal);

		// BrokenStrong: 7.0-12.0 m/s, Heavy Rain
		ref BPR_WeatherStateProfile pBrokenStrong = new BPR_WeatherStateProfile("BrokenStrong", 7.0, 12.0, 1.65, true, false);
		pBrokenStrong.AddTransition("BrokenStrong", 20);
		pBrokenStrong.AddTransition("BrokenNormal", 30);
		pBrokenStrong.AddTransition("BrokenExtreme", 20);
		pBrokenStrong.AddTransition("BrokenThunderStrong", 15);
		pBrokenStrong.AddTransition("OvercastStrong", 15);
		m_mProfiles.Insert("BrokenStrong", pBrokenStrong);

		// BrokenExtreme: 9.0-15.0 m/s, Storm Rain
		ref BPR_WeatherStateProfile pBrokenExtreme = new BPR_WeatherStateProfile("BrokenExtreme", 9.0, 15.0, 1.75, true, false);
		pBrokenExtreme.AddTransition("BrokenExtreme", 15);
		pBrokenExtreme.AddTransition("BrokenStrong", 35);
		pBrokenExtreme.AddTransition("BrokenThunderExtreme", 25);
		pBrokenExtreme.AddTransition("Rainy", 20);
		pBrokenExtreme.AddTransition("BrokenNormal", 5);
		m_mProfiles.Insert("BrokenExtreme", pBrokenExtreme);

		// --- 5. Overcast Family ---
		// Overcast: 3.5-7.5 m/s
		ref BPR_WeatherStateProfile pOvercast = new BPR_WeatherStateProfile("Overcast", 3.5, 7.5, 1.45, false, false);
		pOvercast.AddTransition("Overcast", 30);        // Stable gray overcast
		pOvercast.AddTransition("Broken", 30);
		pOvercast.AddTransition("OvercastNormal", 25);
		pOvercast.AddTransition("Rainy", 10);
		pOvercast.AddTransition("OvercastThunderDry", 5);
		m_mProfiles.Insert("Overcast", pOvercast);

		// OvercastNormal: 5.0-9.0 m/s, Rain
		ref BPR_WeatherStateProfile pOvercastNormal = new BPR_WeatherStateProfile("OvercastNormal", 5.0, 9.0, 1.55, true, false);
		pOvercastNormal.AddTransition("OvercastNormal", 25);
		pOvercastNormal.AddTransition("Overcast", 30);
		pOvercastNormal.AddTransition("OvercastStrong", 25);
		pOvercastNormal.AddTransition("BrokenNormal", 10);
		pOvercastNormal.AddTransition("Rainy", 10);
		m_mProfiles.Insert("OvercastNormal", pOvercastNormal);

		// OvercastStrong: 7.5-13.0 m/s, Heavy Rain
		ref BPR_WeatherStateProfile pOvercastStrong = new BPR_WeatherStateProfile("OvercastStrong", 7.5, 13.0, 1.70, true, false);
		pOvercastStrong.AddTransition("OvercastStrong", 20);
		pOvercastStrong.AddTransition("OvercastNormal", 30);
		pOvercastStrong.AddTransition("Rainy", 30);
		pOvercastStrong.AddTransition("OvercastThunderStrong", 15);
		pOvercastStrong.AddTransition("BrokenStrong", 5);
		m_mProfiles.Insert("OvercastStrong", pOvercastStrong);

		// Rainy: 8.0-14.5 m/s, Continuous Storm Rain
		ref BPR_WeatherStateProfile pRainy = new BPR_WeatherStateProfile("Rainy", 8.0, 14.5, 1.75, true, false);
		pRainy.AddTransition("Rainy", 25);              // Persistent rain day
		pRainy.AddTransition("OvercastNormal", 25);
		pRainy.AddTransition("OvercastStrong", 25);
		pRainy.AddTransition("BrokenExtreme", 15);
		pRainy.AddTransition("OvercastThunderExtreme", 10);
		m_mProfiles.Insert("Rainy", pRainy);

		// --- 6. Thunder Families (Dry, Strong, Extreme) ---
		// CloudyThunderDry: 6.0-11.0 m/s, Squall Gusts (1.8x)
		ref BPR_WeatherStateProfile pCloudyThunderDry = new BPR_WeatherStateProfile("CloudyThunderDry", 6.0, 11.0, 1.80, false, true);
		pCloudyThunderDry.AddTransition("CloudyThunderStrong", 35); // Rain starts inside thunder
		pCloudyThunderDry.AddTransition("Cloudy", 30);              // Thunder dissipates dry
		pCloudyThunderDry.AddTransition("BrokenThunderDry", 25);    // Breaks into broken cloud thunder
		pCloudyThunderDry.AddTransition("Few", 10);
		m_mProfiles.Insert("CloudyThunderDry", pCloudyThunderDry);

		// CloudyThunderStrong: 9.0-15.0 m/s, Rain + Thunder
		ref BPR_WeatherStateProfile pCloudyThunderStrong = new BPR_WeatherStateProfile("CloudyThunderStrong", 9.0, 15.0, 1.85, true, true);
		pCloudyThunderStrong.AddTransition("CloudyStrong", 30);        // Lightning ceases, strong rain remains
		pCloudyThunderStrong.AddTransition("BrokenThunderStrong", 30); // Front propagates
		pCloudyThunderStrong.AddTransition("CloudyThunderDry", 20);
		pCloudyThunderStrong.AddTransition("CloudyNormal", 20);
		m_mProfiles.Insert("CloudyThunderStrong", pCloudyThunderStrong);

		// BrokenThunderDry: 6.5-12.0 m/s
		ref BPR_WeatherStateProfile pBrokenThunderDry = new BPR_WeatherStateProfile("BrokenThunderDry", 6.5, 12.0, 1.80, false, true);
		pBrokenThunderDry.AddTransition("BrokenThunderStrong", 35); // Rain develops
		pBrokenThunderDry.AddTransition("Broken", 30);              // Dissipates
		pBrokenThunderDry.AddTransition("OvercastThunderDry", 20);  // Sky covers completely
		pBrokenThunderDry.AddTransition("CloudyThunderDry", 15);
		m_mProfiles.Insert("BrokenThunderDry", pBrokenThunderDry);

		// BrokenThunderStrong: 9.5-16.0 m/s
		ref BPR_WeatherStateProfile pBrokenThunderStrong = new BPR_WeatherStateProfile("BrokenThunderStrong", 9.5, 16.0, 1.85, true, true);
		pBrokenThunderStrong.AddTransition("BrokenStrong", 30);         // Decays to heavy rain
		pBrokenThunderStrong.AddTransition("BrokenThunderExtreme", 25); // Escalates to extreme storm
		pBrokenThunderStrong.AddTransition("OvercastThunderStrong", 25);
		pBrokenThunderStrong.AddTransition("BrokenThunderDry", 20);
		m_mProfiles.Insert("BrokenThunderStrong", pBrokenThunderStrong);

		// BrokenThunderExtreme: 12.0-20.0 m/s, Severe Gale Gusts (2.0x)
		ref BPR_WeatherStateProfile pBrokenThunderExtreme = new BPR_WeatherStateProfile("BrokenThunderExtreme", 12.0, 20.0, 2.00, true, true);
		pBrokenThunderExtreme.AddTransition("BrokenThunderStrong", 35);  // Subsides
		pBrokenThunderExtreme.AddTransition("OvercastThunderExtreme", 30);
		pBrokenThunderExtreme.AddTransition("BrokenExtreme", 25);
		pBrokenThunderExtreme.AddTransition("Rainy", 10);
		m_mProfiles.Insert("BrokenThunderExtreme", pBrokenThunderExtreme);

		// OvercastThunderDry: 7.0-12.5 m/s
		ref BPR_WeatherStateProfile pOvercastThunderDry = new BPR_WeatherStateProfile("OvercastThunderDry", 7.0, 12.5, 1.80, false, true);
		pOvercastThunderDry.AddTransition("OvercastThunderStrong", 35); // Rain opens up
		pOvercastThunderDry.AddTransition("Overcast", 30);              // Thunder calms down
		pOvercastThunderDry.AddTransition("BrokenThunderDry", 25);
		pOvercastThunderDry.AddTransition("CloudyThunderDry", 10);
		m_mProfiles.Insert("OvercastThunderDry", pOvercastThunderDry);

		// OvercastThunderStrong: 10.0-17.0 m/s
		ref BPR_WeatherStateProfile pOvercastThunderStrong = new BPR_WeatherStateProfile("OvercastThunderStrong", 10.0, 17.0, 1.85, true, true);
		pOvercastThunderStrong.AddTransition("OvercastStrong", 35);        // Turns into continuous heavy rain
		pOvercastThunderStrong.AddTransition("OvercastThunderExtreme", 25); // Peaks into severe storm
		pOvercastThunderStrong.AddTransition("Rainy", 20);
		pOvercastThunderStrong.AddTransition("OvercastThunderDry", 20);
		m_mProfiles.Insert("OvercastThunderStrong", pOvercastThunderStrong);

		// OvercastThunderExtreme: 13.0-22.0 m/s, Severe Gale Gusts (2.0x)
		ref BPR_WeatherStateProfile pOvercastThunderExtreme = new BPR_WeatherStateProfile("OvercastThunderExtreme", 13.0, 22.0, 2.00, true, true);
		pOvercastThunderExtreme.AddTransition("OvercastThunderStrong", 40); // Flaws down
		pOvercastThunderExtreme.AddTransition("Rainy", 35);                 // Turns into gale rain
		pOvercastThunderExtreme.AddTransition("BrokenThunderExtreme", 15);
		pOvercastThunderExtreme.AddTransition("OvercastStrong", 10);
		m_mProfiles.Insert("OvercastThunderExtreme", pOvercastThunderExtreme);
	}

	// --- Getters & Queries ---
	string GetCurrentState() { return m_sCurrentWeatherState; }
	bool HadRecentRain() { return m_bHadRecentRain; }

	//------------------------------------------------------------------------------------------------
	//! Cleans up active weather timers and resets provider state
	void Cleanup()
	{
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);
		m_bIsInitialized = false;
	}
};
