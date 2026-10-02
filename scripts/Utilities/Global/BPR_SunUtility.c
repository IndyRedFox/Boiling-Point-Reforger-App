// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_SunUtility.c
// Author: Indy & AI Assistant
// Description: Global utility class for solar calculations (sunrise, sunset,
//              solar noon, civil twilight, day length, sun progress).
//              Calculates values once per in-game day using original terrain coordinates.
//              Provides O(1) cached getters and ScriptInvokers for day/phase transitions.
// ============================================================================

enum BPR_ETimeOfDay
{
	NIGHT = 0,
	DAWN,
	DAY,
	DUSK
};

//------------------------------------------------------------------------------------------------
class BPR_SunUtility
{
	const static string CALLER_ID = "SunUtil";

	// Solar zenith constants in degrees
	const static float ZENITH_OFFICIAL = 90.833; // Standard disc + refraction
	const static float ZENITH_CIVIL    = 96.0;   // Civil twilight (dawn/dusk)

	// Cached date
	protected static int m_iCachedYear;
	protected static int m_iCachedMonth;
	protected static int m_iCachedDay;

	// Cached terrain coordinates
	protected static float m_fLatitude;
	protected static float m_fLongitude;

	// Cached solar times in decimal hours (e.g. 6.5 = 06:30)
	protected static float m_fSunriseHour;
	protected static float m_fSunsetHour;
	protected static float m_fSolarNoonHour;
	protected static float m_fCivilDawnHour;
	protected static float m_fCivilDuskHour;

	// Cached formatted time strings (e.g. "06:24:15")
	protected static string m_sSunriseTime;
	protected static string m_sSunsetTime;
	protected static string m_sSolarNoonTime;
	protected static string m_sCivilDawnTime;
	protected static string m_sCivilDuskTime;

	// Cached durations
	protected static int m_iDayDurationSeconds;
	protected static int m_iNightDurationSeconds;
	protected static string m_sDayDurationFormatted;

	// Cached state
	protected static BPR_ETimeOfDay m_eCurrentPhase = BPR_ETimeOfDay.NIGHT;
	protected static bool m_bIsDaytime;
	protected static bool m_bIsInitialized;

	// Cached manager instance
	protected static TimeAndWeatherManagerEntity m_pTimeManager;

	// ===============================================================================================
	// INITIALIZATION & CLEANUP
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Initializes the sun utility, computes today's values, and listens to BPR_DateTimeScheduler
	static void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pTimeManager)
		{
			DebugLog.Err(CALLER_ID, "Failed to retrieve TimeAndWeatherManager in Init! Sun calculations aborted.");
			return;
		}

		// Retrieve strictly original map coordinates without config overrides
		string sSource;
		if (!BPR_MapUtility.GetOriginalCoordinates(m_fLatitude, m_fLongitude, sSource))
		{
			DebugLog.Warn(CALLER_ID, "Failed to read original terrain coordinates. Using Prague HQ fallback.");
			BPR_MapUtility.GetFallbackCoordinates(m_fLatitude, m_fLongitude, sSource);
		}

		DebugLog.Info(CALLER_ID, string.Format("Initialized with coords: Lat=%1, Lon=%2 (%3)", m_fLatitude, m_fLongitude, sSource));

		// Initial calculation
		CalculateDailyValues(true);

		// Subscribe to central day change scheduler (zero local polling required)
		BPR_DateTimeScheduler.GetOnDayChanged().Insert(OnDayChanged);
	}

	//------------------------------------------------------------------------------------------------
	//! Resets utility state and unregisters from BPR_DateTimeScheduler (e.g. at mission end)
	static void Reset()
	{
		if (m_bIsInitialized)
		{
			BPR_DateTimeScheduler.GetOnDayChanged().Remove(OnDayChanged);
			m_bIsInitialized = false;
			m_pTimeManager = null;
			DebugLog.Info(CALLER_ID, "Sun utility reset and unhooked from scheduler.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Invoked centrally by BPR_DateTimeScheduler on midnight / day transition
	protected static void OnDayChanged(int iDay, int iMonth, int iYear)
	{
		CalculateDailyValues(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Manually forces a recalculation (e.g. after admin time/date skips)
	static void ForceRecalculate()
	{
		CalculateDailyValues(true);
	}

	// ===============================================================================================
	// SOLAR CALCULATION ALGORITHM
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates all daily astronomical values for the current game date
	protected static void CalculateDailyValues(bool bForcePhaseUpdate)
	{
		if (!m_pTimeManager)
			return;

		m_pTimeManager.GetDate(m_iCachedYear, m_iCachedMonth, m_iCachedDay);

		int iDayOfYear = CalculateDayOfYear(m_iCachedDay, m_iCachedMonth, m_iCachedYear);
		float fTotalDays = 365.0;
		if (BPR_DateTimeUtility.IsLeapYear(m_iCachedYear))
			fTotalDays = 366.0;

		// Fractional year in radians
		float fGamma = (2.0 * Math.PI / fTotalDays) * (iDayOfYear - 1);

		// Equation of time in minutes
		float fEqTime = 229.18 * (0.000075 + 0.001868 * Math.Cos(fGamma) - 0.032077 * Math.Sin(fGamma) - 0.014615 * Math.Cos(2.0 * fGamma) - 0.040849 * Math.Sin(2.0 * fGamma));

		// Solar declination in radians
		float fDeclination = 0.006918 - 0.399912 * Math.Cos(fGamma) + 0.070257 * Math.Sin(fGamma) - 0.006758 * Math.Cos(2.0 * fGamma) + 0.000907 * Math.Sin(2.0 * fGamma) - 0.002697 * Math.Cos(3.0 * fGamma) + 0.00148 * Math.Sin(3.0 * fGamma);

		// Solar noon in decimal hours
		m_fSolarNoonHour = 12.0 - (fEqTime / 60.0);

		// Calculate hour angles for official sunrise/sunset and civil dawn/dusk
		float fOfficialHourAngle = CalculateHourAngle(m_fLatitude, fDeclination, ZENITH_OFFICIAL);
		float fCivilHourAngle    = CalculateHourAngle(m_fLatitude, fDeclination, ZENITH_CIVIL);

		// Official Sunrise & Sunset
		m_fSunriseHour = m_fSolarNoonHour - fOfficialHourAngle;
		m_fSunsetHour  = m_fSolarNoonHour + fOfficialHourAngle;

		// Civil Dawn & Dusk
		m_fCivilDawnHour = m_fSolarNoonHour - fCivilHourAngle;
		m_fCivilDuskHour = m_fSolarNoonHour + fCivilHourAngle;

		// Clamp values to [0.0, 24.0]
		m_fSunriseHour   = Math.Clamp(m_fSunriseHour, 0.0, 24.0);
		m_fSunsetHour    = Math.Clamp(m_fSunsetHour, 0.0, 24.0);
		m_fCivilDawnHour = Math.Clamp(m_fCivilDawnHour, 0.0, 24.0);
		m_fCivilDuskHour = Math.Clamp(m_fCivilDuskHour, 0.0, 24.0);

		// Formatted strings
		m_sSunriseTime   = FormatDecimalHours(m_fSunriseHour);
		m_sSunsetTime    = FormatDecimalHours(m_fSunsetHour);
		m_sSolarNoonTime = FormatDecimalHours(m_fSolarNoonHour);
		m_sCivilDawnTime = FormatDecimalHours(m_fCivilDawnHour);
		m_sCivilDuskTime = FormatDecimalHours(m_fCivilDuskHour);

		// Calculate day and night durations
		float fDayDurationHours = m_fSunsetHour - m_fSunriseHour;
		if (fDayDurationHours < 0.0)
			fDayDurationHours = 0.0;

		m_iDayDurationSeconds   = Math.Round(fDayDurationHours * 3600.0);
		m_iNightDurationSeconds = 86400 - m_iDayDurationSeconds;
		m_sDayDurationFormatted = BPR_DateTimeUtility.FormatDuration(m_iDayDurationSeconds, true);

		DebugLog.Info(CALLER_ID, string.Format("Calculated Sun: Dawn=%1 | Sunrise=%2 | Noon=%3 | Sunset=%4 | Dusk=%5 | DayLen=%6", m_sCivilDawnTime, m_sSunriseTime, m_sSolarNoonTime, m_sSunsetTime, m_sCivilDuskTime, m_sDayDurationFormatted));

		if (bForcePhaseUpdate)
		{
			float fCurrentHour = m_pTimeManager.GetTimeOfTheDay();
			UpdateCurrentPhase(fCurrentHour);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates hour angle in decimal hours for a given zenith
	protected static float CalculateHourAngle(float fLatDeg, float fDeclinationRad, float fZenithDeg)
	{
		float fLatRad = fLatDeg * Math.DEG2RAD;
		float fZenithRad = fZenithDeg * Math.DEG2RAD;

		float fCosHourAngle = (Math.Cos(fZenithRad) - Math.Sin(fLatRad) * Math.Sin(fDeclinationRad)) / (Math.Cos(fLatRad) * Math.Cos(fDeclinationRad));

		// Polar day (sun never sets)
		if (fCosHourAngle < -1.0)
			return 12.0;

		// Polar night (sun never rises)
		if (fCosHourAngle > 1.0)
			return 0.0;

		float fHourAngleRad = Math.Acos(fCosHourAngle);
		return (fHourAngleRad * Math.RAD2DEG) / 15.0; // 15 degrees per hour
	}

	//------------------------------------------------------------------------------------------------
	//! Computes day of year (1-366)
	protected static int CalculateDayOfYear(int iDay, int iMonth, int iYear)
	{
		int iDayCount = iDay;
		for (int iM = 1; iM < iMonth; iM++)
		{
			iDayCount += BPR_DateTimeUtility.GetDaysInMonth(iM, iYear);
		}
		return iDayCount;
	}

	//------------------------------------------------------------------------------------------------
	//! Updates current time phase based on current decimal hour
	protected static void UpdateCurrentPhase(float fCurrentHour)
	{
		if (fCurrentHour < m_fCivilDawnHour || fCurrentHour >= m_fCivilDuskHour)
		{
			m_eCurrentPhase = BPR_ETimeOfDay.NIGHT;
		}
		else if (fCurrentHour < m_fSunriseHour)
		{
			m_eCurrentPhase = BPR_ETimeOfDay.DAWN;
		}
		else if (fCurrentHour < m_fSunsetHour)
		{
			m_eCurrentPhase = BPR_ETimeOfDay.DAY;
		}
		else
		{
			m_eCurrentPhase = BPR_ETimeOfDay.DUSK;
		}

		m_bIsDaytime = (m_eCurrentPhase == BPR_ETimeOfDay.DAY);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats decimal hours into HH:MM:SS string
	protected static string FormatDecimalHours(float fDecimalHours)
	{
		int iTotalSeconds = Math.Round(fDecimalHours * 3600.0);
		int iHours = iTotalSeconds / 3600;
		int iMinutes = (iTotalSeconds % 3600) / 60;
		int iSeconds = iTotalSeconds % 60;

		return BPR_DateTimeUtility.FormatTime(iHours, iMinutes, iSeconds);
	}

	// ===============================================================================================
	// O(1) FAST GETTERS (Zero recalculation cost)
	// ===============================================================================================

	static float GetSunriseHour()       { return m_fSunriseHour; }
	static float GetSunsetHour()        { return m_fSunsetHour; }
	static float GetSolarNoonHour()     { return m_fSolarNoonHour; }
	static float GetCivilDawnHour()     { return m_fCivilDawnHour; }
	static float GetCivilDuskHour()     { return m_fCivilDuskHour; }

	static string GetSunriseTimeString()   { return m_sSunriseTime; }
	static string GetSunsetTimeString()    { return m_sSunsetTime; }
	static string GetSolarNoonTimeString() { return m_sSolarNoonTime; }
	static string GetCivilDawnTimeString() { return m_sCivilDawnTime; }
	static string GetCivilDuskTimeString() { return m_sCivilDuskTime; }

	static int GetDayDurationSeconds()        { return m_iDayDurationSeconds; }
	static int GetNightDurationSeconds()      { return m_iNightDurationSeconds; }
	static string GetDayDurationFormatted()   { return m_sDayDurationFormatted; }

	static BPR_ETimeOfDay GetCurrentPhase()
	{
		if (m_pTimeManager)
			UpdateCurrentPhase(m_pTimeManager.GetTimeOfTheDay());
		return m_eCurrentPhase;
	}

	static bool IsDay()
	{
		if (m_pTimeManager)
			UpdateCurrentPhase(m_pTimeManager.GetTimeOfTheDay());
		return m_bIsDaytime;
	}

	static bool IsNight() { return (GetCurrentPhase() == BPR_ETimeOfDay.NIGHT); }
	static bool IsDawn()  { return (GetCurrentPhase() == BPR_ETimeOfDay.DAWN); }
	static bool IsDusk()  { return (GetCurrentPhase() == BPR_ETimeOfDay.DUSK); }

	//------------------------------------------------------------------------------------------------
	//! Returns the linear sun progress from sunrise (0.0) to sunset (1.0). Returns 0.0 at night.
	static float GetSunProgress()
	{
		if (!m_pTimeManager)
			return 0.0;

		float fCurrentHour = m_pTimeManager.GetTimeOfTheDay();
		if (fCurrentHour < m_fSunriseHour || fCurrentHour > m_fSunsetHour)
			return 0.0;

		float fDayLength = m_fSunsetHour - m_fSunriseHour;
		if (fDayLength <= 0.0001)
			return 0.0;

		return Math.Clamp((fCurrentHour - m_fSunriseHour) / fDayLength, 0.0, 1.0);
	}
};
