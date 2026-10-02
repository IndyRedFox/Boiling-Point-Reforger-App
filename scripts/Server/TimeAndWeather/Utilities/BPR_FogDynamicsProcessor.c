// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_FogDynamicsProcessor.c
// Author: Indy & AI Assistant
// Description: Processor for atmospheric fog simulation and dynamic density transitions.
//              - Hibernation Mode: 0% CPU consumption during clear weather; wakes up
//                only when fog values are registered.
//              - Dynamic Transitions: Transition times scale dynamically with density
//                deltas (e.g. 3-5 min for light haze, 10-18 min for thick soup)
//                with organic random variance (±15-20%).
//              - Wind Dissipation: If high winds are active (> 15 km/h), fog dissipates
//                measurably faster (blown away).
//              - Atmospheric Wabern: Slow, organic breathing wave (pulsation) around
//                the base density to make fog fields feel alive.
//              - Smooth Zero-Falloff: Fades completely to 0.0 before safely returning
//                to hibernation.
// ============================================================================

class BPR_FogDynamicsProcessor
{
	const static string CALLER_ID = "FogProc";

	// Tuning constants
	const static int TICK_INTERVAL_MS = 1000;                // 1.0 second per update tick
	const static float MIN_TRANSITION_SEC = 180.0;           // 3 minutes min transition (light changes)
	const static float MAX_TRANSITION_SEC = 900.0;           // 15 minutes max transition (full dense soup)
	const static float WABERN_CYCLE_SPEED = 0.04;            // Slow atmospheric breathing wave frequency
	const static float MAX_WABERN_AMPLITUDE = 0.04;          // Max ±4% breathing fluctuation

	protected static ref BPR_FogDynamicsProcessor s_pInstance;

	// Target and current densities (0.0 = completely clear, 1.0 = maximum dense fog)
	protected float m_fTargetDensity = 0.0;
	protected float m_fCurrentDensity = 0.0;
	protected float m_fEffectiveDensity = 0.0;               // Current density + atmospheric breathing
	protected float m_fTransitionStartDensity = 0.0;

	// Transition timing (dynamic)
	protected float m_fTransitionDuration = 0.0;
	protected float m_fTransitionElapsedTime = 0.0;
	protected bool m_bInTransition = false;

	// Atmospheric oscillation phase
	protected float m_fBreathingPhase = 0.0;

	// Lifecycle and hibernation state
	protected bool m_bIsHibernating = true;
	protected ref ScriptInvoker m_OnFogUpdated;
	protected TimeAndWeatherManagerEntity m_pTimeManager;

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_FogDynamicsProcessor()
	{
		m_OnFogUpdated = new ScriptInvoker();
	}

	//------------------------------------------------------------------------------------------------
	//! Singleton instance getter
	static BPR_FogDynamicsProcessor GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_FogDynamicsProcessor();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired on each update tick: (float fBaseDensity, float fEffectiveDensity, float fVisibilityMeters)
	ScriptInvoker GetOnFogUpdated()
	{
		return m_OnFogUpdated;
	}

	//------------------------------------------------------------------------------------------------
	//! Primary interface: Sets target fog density (0.0 to 1.0). Optional custom duration in seconds.
	void SetTargetFogDensity(float fTargetDensity, float fCustomDurationSec = -1.0)
	{
		float fClampedTarget = Math.Clamp(fTargetDensity, 0.0, 1.0);

		// If target is 0 and current density is 0, do not wake up or touch engine override
		if (fClampedTarget <= 0.001 && m_fCurrentDensity <= 0.001)
			return;

		// If target has not changed and we are already stable, ignore
		if (Math.AbsFloat(fClampedTarget - m_fTargetDensity) < 0.001 && !m_bInTransition)
			return;

		m_fTargetDensity = fClampedTarget;
		m_fTransitionStartDensity = m_fCurrentDensity;
		m_fTransitionElapsedTime = 0.0;
		m_bInTransition = true;

		// Calculate dynamic transition duration
		if (fCustomDurationSec > 0.0)
		{
			m_fTransitionDuration = fCustomDurationSec;
		}
		else
		{
			m_fTransitionDuration = CalculateDynamicDuration(m_fTransitionStartDensity, m_fTargetDensity);
		}

		// Wake up processor if currently hibernating
		if (m_bIsHibernating)
		{
			WakeUp();
		}

		int iDurationMinutes = Math.Round(m_fTransitionDuration / 60.0);
		DebugLog.Info(CALLER_ID, string.Format("Neues Nebelziel: %1% (Dauer: ca. %2 min, Start: %3%)",
			Math.Round(m_fTargetDensity * 100.0), iDurationMinutes, Math.Round(m_fCurrentDensity * 100.0)));
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates organic transition duration based on density delta, random factor, and wind dissipation
	protected float CalculateDynamicDuration(float fStartDensity, float fTargetDensity)
	{
		float fDelta = Math.AbsFloat(fTargetDensity - fStartDensity);
		
		// Interpolate base duration between min (3 min) and max (15 min)
		float fBaseDuration = Math.Lerp(MIN_TRANSITION_SEC, MAX_TRANSITION_SEC, fDelta);

		// Organic random variance factor (±15%)
		float fRandomFactor = Math.RandomFloat(0.85, 1.15);
		float fFinalDuration = fBaseDuration * fRandomFactor;

		// Wind influence: If fog is dissipating (target < start), high wind blows fog away faster
		if (fTargetDensity < fStartDensity)
		{
			BPR_WindDynamicsProcessor pWindProcessor = BPR_WindDynamicsProcessor.GetInstance();
			if (pWindProcessor && pWindProcessor.IsRunning())
			{
				float fWindKmH = pWindProcessor.GetActiveSpeedKmH();
				if (fWindKmH > 15.0)
				{
					// Wind between 15 km/h and 50 km/h accelerates dissipation by up to 40%
					float fWindSpeedFactor = Math.Clamp(1.0 - ((fWindKmH - 15.0) / 35.0 * 0.4), 0.60, 1.0);
					fFinalDuration *= fWindSpeedFactor;
					DebugLog.Info(CALLER_ID, string.Format("Wind (%1 km/h) beschleunigt Nebelaufloesung um %2%%.",
						Math.Round(fWindKmH), Math.Round((1.0 - fWindSpeedFactor) * 100.0)));
				}
			}
		}

		return Math.Max(60.0, fFinalDuration); // At least 60 seconds
	}

	//------------------------------------------------------------------------------------------------
	//! Wakes up the processor and begins ticking
	protected void WakeUp()
	{
		if (!m_bIsHibernating)
			return;

		m_bIsHibernating = false;
		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		GetGame().GetCallqueue().Remove(OnUpdateTick);
		GetGame().GetCallqueue().CallLater(OnUpdateTick, TICK_INTERVAL_MS, true);

		DebugLog.Info(CALLER_ID, "Nebel-Prozessor erwacht aus dem Ruhezustand.");
	}

	//------------------------------------------------------------------------------------------------
	//! Puts the processor into complete sleep (0% CPU footprint)
	protected void Hibernate()
	{
		if (m_bIsHibernating)
			return;

		m_bIsHibernating = true;
		m_bInTransition = false;
		m_fCurrentDensity = 0.0;
		m_fEffectiveDensity = 0.0;

		GetGame().GetCallqueue().Remove(OnUpdateTick);

		// Ensure engine fog is clean
		ApplyFogToEngine(0.0);

		// Final broadcast for listeners
		if (m_OnFogUpdated)
			m_OnFogUpdated.Invoke(0.0, 0.0, 10000.0);

		DebugLog.Info(CALLER_ID, "Nebel vollstaendig aufgeloest. Prozessor wechselt in den Ruhezustand (0% CPU).");
	}

	//------------------------------------------------------------------------------------------------
	//! Core tick executed once per second when active
	protected void OnUpdateTick()
	{
		if (m_bIsHibernating)
			return;

		float fDeltaTime = 1.0;

		// 1. Advance smooth transition if in progress
		if (m_bInTransition)
		{
			m_fTransitionElapsedTime += fDeltaTime;
			float fProgress = Math.Clamp(m_fTransitionElapsedTime / m_fTransitionDuration, 0.0, 1.0);

			// Smooth S-curve (smoothstep) for natural rolling in/out
			float fSmoothProgress = fProgress * fProgress * (3.0 - (2.0 * fProgress));
			m_fCurrentDensity = Math.Lerp(m_fTransitionStartDensity, m_fTargetDensity, fSmoothProgress);

			if (fProgress >= 1.0)
			{
				m_fCurrentDensity = m_fTargetDensity;
				m_bInTransition = false;
				DebugLog.Info(CALLER_ID, string.Format("Nebel-Uebergang abgeschlossen. Stabile Dichte: %1%",
					Math.Round(m_fCurrentDensity * 100.0)));

				// If target reached 0.0, safely hibernate!
				if (m_fCurrentDensity <= 0.001)
				{
					Hibernate();
					return;
				}
			}
		}

		// 2. Calculate atmospheric breathing / wabern (subtle natural pulsation)
		float fWabern = 0.0;
		if (m_fCurrentDensity > 0.02)
		{
			m_fBreathingPhase += fDeltaTime * WABERN_CYCLE_SPEED;
			if (m_fBreathingPhase > (Math.PI * 2.0))
				m_fBreathingPhase -= (Math.PI * 2.0);

			fWabern = Math.Sin(m_fBreathingPhase) * MAX_WABERN_AMPLITUDE * m_fCurrentDensity;
		}

		m_fEffectiveDensity = Math.Clamp(m_fCurrentDensity + fWabern, 0.0, 1.0);

		// 3. Apply to Enfusion engine
		ApplyFogToEngine(m_fEffectiveDensity);

		// 4. Calculate approximate visibility in meters (10000m clear -> 40m pea-soup)
		float fVisibilityMeters = Math.Lerp(10000.0, 40.0, m_fEffectiveDensity);

		// 5. Broadcast to external listeners (UI, Post-Processing, Audio, etc.)
		if (m_OnFogUpdated)
			m_OnFogUpdated.Invoke(m_fCurrentDensity, m_fEffectiveDensity, fVisibilityMeters);
	}

	//------------------------------------------------------------------------------------------------
	//! Transmits fog density to TimeAndWeatherManagerEntity
	protected void ApplyFogToEngine(float fDensity)
	{
		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (!m_pTimeManager)
			return;

		if (fDensity > 0.001)
		{
			m_pTimeManager.SetFogAmountOverride(true, fDensity);
		}
		else
		{
			m_pTimeManager.SetFogAmountOverride(false, 0.0);
		}
	}

	// ===============================================================================================
	// GETTERS
	// ===============================================================================================

	//! Returns base fog density (0.0 to 1.0)
	float GetCurrentDensity()
	{
		return m_fCurrentDensity;
	}

	//! Returns effective density including atmospheric breathing (0.0 to 1.0)
	float GetEffectiveDensity()
	{
		return m_fEffectiveDensity;
	}

	//! Returns current target density (0.0 to 1.0)
	float GetTargetDensity()
	{
		return m_fTargetDensity;
	}

	//! Returns estimated view distance in meters based on current density
	float GetEstimatedVisibilityMeters()
	{
		return Math.Lerp(10000.0, 40.0, m_fEffectiveDensity);
	}

	//! Returns whether processor is currently asleep (0% CPU)
	bool IsHibernating()
	{
		return m_bIsHibernating;
	}

	//! Returns whether a transition is currently in progress
	bool IsInTransition()
	{
		return m_bInTransition;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance (e.g. mission restart)
	static void Reset()
	{
		if (s_pInstance)
		{
			GetGame().GetCallqueue().Remove(s_pInstance.OnUpdateTick);
			s_pInstance.ApplyFogToEngine(0.0);
			if (s_pInstance.m_OnFogUpdated)
				s_pInstance.m_OnFogUpdated.Clear();
			s_pInstance = null;
		}
	}
};
