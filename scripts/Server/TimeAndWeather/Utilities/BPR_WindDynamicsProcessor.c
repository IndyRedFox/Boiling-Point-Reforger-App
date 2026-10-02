// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WindDynamicsProcessor.c
// Author: Indy & AI Assistant
// Description: Central processor for dynamic wind simulation and audio smoothing.
//              - Receives base speed, direction, and gust targets from Weather Providers
//                (BPR_WeatherProviderOpenMeteo / BPR_WeatherProviderSimple).
//              - Smoothly interpolates speeds (slew-rate limiter) to prevent audio
//                clipping or abrupt sound loop jumps in the Reforger sound engine.
//              - Interpolates wind direction along the shortest angular path.
//              - Generates organic micro-turbulence (subtle continuous fluctuations).
//              - Simulates authentic gust events (ramp-up -> peak -> decay) based on
//                actual peak gust data, and occasional natural lulls (Flauten).
//              - Overrides and updates engine wind via TimeAndWeatherManagerEntity.
// ============================================================================

enum BPR_EWindGustState
{
	IDLE,
	RAMP_UP,
	PEAK,
	DECAY,
	LULL
};

class BPR_WindDynamicsProcessor
{
	const static string CALLER_ID = "WindProc";

	// Tuning constants
	const static int TICK_INTERVAL_MS = 1000;               // Update once per second
	const static float MAX_SPEED_DELTA_PER_SEC = 0.6;       // Max base speed change per sec (~2.1 km/h) for sound safety
	const static float MAX_DIRECTION_DELTA_PER_SEC = 6.0;   // Max direction turn rate per sec (degrees)
	const static float MIN_GUST_INTERVAL_SEC = 25.0;        // Min seconds between gust/lull events
	const static float MAX_GUST_INTERVAL_SEC = 65.0;        // Max seconds between gust/lull events

	protected static ref BPR_WindDynamicsProcessor s_pInstance;

	// Target values supplied by weather providers (stored in m/s and degrees)
	protected float m_fTargetBaseSpeed = 3.0;      // Target sustained speed (m/s)
	protected float m_fTargetDirection = 180.0;    // Target wind angle (0..360 deg)
	protected float m_fTargetPeakGust = 5.0;       // Target peak gust speed (m/s)

	// Current smoothed base values (m/s and degrees)
	protected float m_fCurrentBaseSpeed = 3.0;
	protected float m_fCurrentDirection = 180.0;

	// Output actual values currently sent to the engine
	protected float m_fActiveSpeed = 3.0;
	protected float m_fActiveDirection = 180.0;

	// Gust and lull state machine
	protected BPR_EWindGustState m_eGustState = BPR_EWindGustState.IDLE;
	protected float m_fNextEventCountdown = 30.0;
	protected float m_fGustTimer = 0.0;
	protected float m_fGustDuration = 0.0;
	protected float m_fGustPeakIntensity = 0.0;
	protected float m_fCurrentGustAddSpeed = 0.0;
	protected float m_fCurrentLullFactor = 1.0;

	// State flags
	protected bool m_bIsRunning = false;
	protected ref ScriptInvoker m_OnWindUpdated;
	protected TimeAndWeatherManagerEntity m_pTimeManager;

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_WindDynamicsProcessor()
	{
		m_OnWindUpdated = new ScriptInvoker();
		m_fNextEventCountdown = Math.RandomFloat(MIN_GUST_INTERVAL_SEC, MAX_GUST_INTERVAL_SEC);
	}

	//------------------------------------------------------------------------------------------------
	//! Singleton instance getter
	static BPR_WindDynamicsProcessor GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_WindDynamicsProcessor();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired on each update tick: (float fSpeedMs, float fDirectionDeg, float fSpeedKmH)
	ScriptInvoker GetOnWindUpdated()
	{
		return m_OnWindUpdated;
	}

	//------------------------------------------------------------------------------------------------
	//! Starts the dynamic wind update cycle
	void Start()
	{
		if (m_bIsRunning)
			return;

		m_bIsRunning = true;
		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);

		GetGame().GetCallqueue().Remove(OnUpdateTick);
		GetGame().GetCallqueue().CallLater(OnUpdateTick, TICK_INTERVAL_MS, true);

		DebugLog.Info(CALLER_ID, "Wind-Dynamik-Prozessor gestartet.");
	}

	//------------------------------------------------------------------------------------------------
	//! Stops the processor and releases engine wind control
	void Stop()
	{
		m_bIsRunning = false;
		GetGame().GetCallqueue().Remove(OnUpdateTick);

		if (m_pTimeManager)
		{
			// Release preview override back to engine automation
			m_pTimeManager.SetWindSpeedOverride(false, 0.0);
			m_pTimeManager.SetWindDirectionOverride(false, 0.0);
		}

		DebugLog.Info(CALLER_ID, "Wind-Dynamik-Prozessor gestoppt.");
	}

	//------------------------------------------------------------------------------------------------
	//! Provider interface: Sets new targets in km/h (standard Open-Meteo & Simple format)
	void SetTargetWindKmH(float fSpeedKmH, float fDirectionDeg, float fGustKmH)
	{
		float fSpeedMs = fSpeedKmH / 3.6;
		float fGustMs  = fGustKmH  / 3.6;
		SetTargetWindMs(fSpeedMs, fDirectionDeg, fGustMs);
	}

	//------------------------------------------------------------------------------------------------
	//! Provider interface: Sets new targets directly in m/s (Enfusion engine standard)
	void SetTargetWindMs(float fSpeedMs, float fDirectionDeg, float fGustMs)
	{
		m_fTargetBaseSpeed = Math.Max(0.0, fSpeedMs);
		m_fTargetDirection = NormalizeAngle(fDirectionDeg);
		m_fTargetPeakGust  = Math.Max(m_fTargetBaseSpeed, fGustMs);

		// If stopped, start automatically upon receiving valid wind targets
		if (!m_bIsRunning)
		{
			m_fCurrentBaseSpeed = m_fTargetBaseSpeed;
			m_fCurrentDirection = m_fTargetDirection;
			Start();
		}

		DebugLog.Info(CALLER_ID, string.Format("Neue Windziele gesetzt: Basis=%1 m/s (%2 km/h), Richtung=%3°, Boee=%4 m/s (%5 km/h)",
			m_fTargetBaseSpeed, Math.Round(m_fTargetBaseSpeed * 3.6), Math.Round(m_fTargetDirection), m_fTargetPeakGust, Math.Round(m_fTargetPeakGust * 3.6)));
	}

	//------------------------------------------------------------------------------------------------
	//! Core tick executed once per second
	protected void OnUpdateTick()
	{
		if (!m_bIsRunning)
			return;

		float fDeltaTime = 1.0; // 1.0 second per tick

		// 1. Smooth base speed transition towards provider target (sound pop protection)
		UpdateBaseSpeedTransition(fDeltaTime);

		// 2. Smooth direction rotation towards provider target (shortest angular path)
		UpdateDirectionTransition(fDeltaTime);

		// 3. Process gusts and lulls state machine
		UpdateGustsAndLulls(fDeltaTime);

		// 4. Calculate micro-turbulence (subtle natural wobble around base value)
		float fTurbulenceSpeed = (Math.RandomFloat01() - 0.5) * 0.35;
		float fTurbulenceDir   = (Math.RandomFloat01() - 0.5) * 2.5;

		// 5. Combine base, lull factor, gust addition, and micro-turbulence
		float fCalculatedSpeed = (m_fCurrentBaseSpeed * m_fCurrentLullFactor) + m_fCurrentGustAddSpeed + fTurbulenceSpeed;
		m_fActiveSpeed = Math.Clamp(fCalculatedSpeed, 0.0, 50.0);
		m_fActiveDirection = NormalizeAngle(m_fCurrentDirection + fTurbulenceDir);

		// 6. Apply updated wind vector to the game world via TimeAndWeatherManagerEntity
		ApplyWindToEngine(m_fActiveSpeed, m_fActiveDirection);

		// 7. Invoke external listeners
		if (m_OnWindUpdated)
			m_OnWindUpdated.Invoke(m_fActiveSpeed, m_fActiveDirection, m_fActiveSpeed * 3.6);
	}

	//------------------------------------------------------------------------------------------------
	//! Slew-rate limiter for base speed to guarantee soft audio loop transitions
	protected void UpdateBaseSpeedTransition(float fDeltaTime)
	{
		float fDifference = m_fTargetBaseSpeed - m_fCurrentBaseSpeed;
		float fMaxStep = MAX_SPEED_DELTA_PER_SEC * fDeltaTime;

		if (Math.AbsFloat(fDifference) <= fMaxStep)
		{
			m_fCurrentBaseSpeed = m_fTargetBaseSpeed;
		}
		else
		{
			if (fDifference > 0.0)
				m_fCurrentBaseSpeed += fMaxStep;
			else
				m_fCurrentBaseSpeed -= fMaxStep;
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Smoothly interpolates wind direction along the shortest circle arc
	protected void UpdateDirectionTransition(float fDeltaTime)
	{
		float fAngleDiff = m_fTargetDirection - m_fCurrentDirection;

		while (fAngleDiff < -180.0)
			fAngleDiff += 360.0;
		while (fAngleDiff > 180.0)
			fAngleDiff -= 360.0;

		float fMaxTurn = MAX_DIRECTION_DELTA_PER_SEC * fDeltaTime;

		if (Math.AbsFloat(fAngleDiff) <= fMaxTurn)
		{
			m_fCurrentDirection = m_fTargetDirection;
		}
		else
		{
			if (fAngleDiff > 0.0)
				m_fCurrentDirection += fMaxTurn;
			else
				m_fCurrentDirection -= fMaxTurn;

			m_fCurrentDirection = NormalizeAngle(m_fCurrentDirection);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! State machine controlling gust events and calm lulls
	protected void UpdateGustsAndLulls(float fDeltaTime)
	{
		if (m_eGustState == BPR_EWindGustState.IDLE)
		{
			m_fCurrentGustAddSpeed = 0.0;
			m_fCurrentLullFactor = 1.0;
			m_fNextEventCountdown -= fDeltaTime;

			if (m_fNextEventCountdown <= 0.0)
			{
				TriggerRandomWindEvent();
			}
			return;
		}

		m_fGustTimer += fDeltaTime;
		float fProgress = Math.Clamp(m_fGustTimer / m_fGustDuration, 0.0, 1.0);

		switch (m_eGustState)
		{
			case BPR_EWindGustState.RAMP_UP:
			{
				// Smooth rise to peak gust
				m_fCurrentGustAddSpeed = m_fGustPeakIntensity * fProgress;
				if (m_fGustTimer >= m_fGustDuration)
				{
					m_eGustState = BPR_EWindGustState.PEAK;
					m_fGustTimer = 0.0;
					m_fGustDuration = Math.RandomFloat(1.2, 2.2); // Hold peak briefly
				}
				break;
			}

			case BPR_EWindGustState.PEAK:
			{
				// Hold near peak with subtle flutter
				float fFlutter = (Math.RandomFloat01() - 0.5) * 0.4;
				m_fCurrentGustAddSpeed = Math.Max(0.0, m_fGustPeakIntensity + fFlutter);

				if (m_fGustTimer >= m_fGustDuration)
				{
					m_eGustState = BPR_EWindGustState.DECAY;
					m_fGustTimer = 0.0;
					m_fGustDuration = Math.RandomFloat(3.0, 4.5); // Decay smoothly
				}
				break;
			}

			case BPR_EWindGustState.DECAY:
			{
				// Smooth falloff back to baseline
				m_fCurrentGustAddSpeed = m_fGustPeakIntensity * (1.0 - fProgress);
				if (m_fGustTimer >= m_fGustDuration)
				{
					m_eGustState = BPR_EWindGustState.IDLE;
					m_fCurrentGustAddSpeed = 0.0;
					m_fNextEventCountdown = Math.RandomFloat(MIN_GUST_INTERVAL_SEC, MAX_GUST_INTERVAL_SEC);
				}
				break;
			}

			case BPR_EWindGustState.LULL:
			{
				// Natural lull: Wind dips to 65% - 75% then returns
				float fSinProgress = Math.Sin(fProgress * Math.PI);
				float fMaxDip = 0.30; // Max 30% reduction
				m_fCurrentLullFactor = 1.0 - (fSinProgress * fMaxDip);

				if (m_fGustTimer >= m_fGustDuration)
				{
					m_eGustState = BPR_EWindGustState.IDLE;
					m_fCurrentLullFactor = 1.0;
					m_fNextEventCountdown = Math.RandomFloat(MIN_GUST_INTERVAL_SEC, MAX_GUST_INTERVAL_SEC);
				}
				break;
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Decides randomly whether to spawn a gust or a calm lull
	protected void TriggerRandomWindEvent()
	{
		float fGustPotential = m_fTargetPeakGust - m_fCurrentBaseSpeed;

		// If peak gust is higher than current base speed, 75% chance of Gust, 25% chance of Lull
		if (fGustPotential >= 1.0 && Math.RandomFloat01() < 0.75)
		{
			m_eGustState = BPR_EWindGustState.RAMP_UP;
			m_fGustTimer = 0.0;
			m_fGustDuration = Math.RandomFloat(2.0, 3.2); // 2 to 3.2 seconds ramp-up
			m_fGustPeakIntensity = Math.Min(fGustPotential, 18.0); // Safe peak intensity
		}
		else
		{
			// Calm lull (Flaute)
			m_eGustState = BPR_EWindGustState.LULL;
			m_fGustTimer = 0.0;
			m_fGustDuration = Math.RandomFloat(4.0, 6.5); // 4 to 6.5 seconds lull
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Safely transmits wind speed and direction to TimeAndWeatherManagerEntity
	protected void ApplyWindToEngine(float fSpeedMs, float fDirectionDeg)
	{
		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (m_pTimeManager)
		{
			m_pTimeManager.SetWindSpeedOverride(true, fSpeedMs);
			m_pTimeManager.SetWindDirectionOverride(true, fDirectionDeg);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Helper to normalize degrees into 0..360 range
	protected float NormalizeAngle(float fAngle)
	{
		float fNorm = fAngle;
		while (fNorm < 0.0)
			fNorm += 360.0;
		while (fNorm >= 360.0)
			fNorm -= 360.0;
		return fNorm;
	}

	// ===============================================================================================
	// GETTERS
	// ===============================================================================================

	//! Returns current actual active wind speed in meters per second (m/s)
	float GetActiveSpeedMs()
	{
		return m_fActiveSpeed;
	}

	//! Returns current actual active wind speed in kilometers per hour (km/h)
	float GetActiveSpeedKmH()
	{
		return m_fActiveSpeed * 3.6;
	}

	//! Returns current actual active wind direction in degrees (0..360)
	float GetActiveDirection()
	{
		return m_fActiveDirection;
	}

	//! Returns current base speed target in m/s
	float GetTargetBaseSpeedMs()
	{
		return m_fTargetBaseSpeed;
	}

	//! Returns current target peak gust speed in m/s
	float GetTargetPeakGustMs()
	{
		return m_fTargetPeakGust;
	}

	//! Returns whether processor is currently active
	bool IsRunning()
	{
		return m_bIsRunning;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance and timers (e.g. on mission restart)
	static void Reset()
	{
		if (s_pInstance)
		{
			s_pInstance.Stop();
			if (s_pInstance.m_OnWindUpdated)
				s_pInstance.m_OnWindUpdated.Clear();
			s_pInstance = null;
		}
	}
};
