// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_DateTimeScheduler.c
// Author: Indy & AI Assistant
// Description: Central date and time scheduler utility.
//              Provides a low-frequency heartbeat (5000ms) to detect in-game
//              day transitions and notifies subscribed systems via ScriptInvoker.
// ============================================================================

class BPR_DateTimeScheduler
{
	const static string CALLER_ID = "DateSched";

	// Check frequency: 5 seconds (5000 ms)
	const static int UPDATE_INTERVAL_MS = 5000;

	// State
	protected static bool m_bIsInitialized;
	protected static TimeAndWeatherManagerEntity m_pTimeManager;

	// Cached date
	protected static int m_iCachedYear;
	protected static int m_iCachedMonth;
	protected static int m_iCachedDay;

	// Central day change event
	protected static ref ScriptInvoker m_OnDayChanged;

	//------------------------------------------------------------------------------------------------
	//! Initializes the scheduler, caches starting date, and starts the 5s interval timer
	static void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pTimeManager)
		{
			DebugLog.Err(CALLER_ID, "Failed to retrieve TimeAndWeatherManager in Init! Scheduler aborted.");
			return;
		}

		m_pTimeManager.GetDate(m_iCachedYear, m_iCachedMonth, m_iCachedDay);

		DebugLog.Info(CALLER_ID, string.Format("Initialized. Date: %1-%2-%3 | Interval: %4ms", m_iCachedYear, m_iCachedMonth, m_iCachedDay, UPDATE_INTERVAL_MS));

		GetGame().GetCallqueue().CallLater(CheckDate, UPDATE_INTERVAL_MS, true);
	}

	//------------------------------------------------------------------------------------------------
	//! Stops heartbeat timer, clears subscribers and resets state (e.g. at mission end)
	static void Reset()
	{
		if (GetGame())
			GetGame().GetCallqueue().Remove(CheckDate);

		if (m_OnDayChanged)
		{
			m_OnDayChanged.Clear();
			m_OnDayChanged = null;
		}

		m_bIsInitialized = false;
		m_pTimeManager = null;
		m_iCachedYear = 0;
		m_iCachedMonth = 0;
		m_iCachedDay = 0;

		DebugLog.Info(CALLER_ID, "Scheduler reset and stopped.");
	}

	//------------------------------------------------------------------------------------------------
	//! Periodic check executed every 5s. Compares date and invokes OnDayChanged when date transitions.
	protected static void CheckDate()
	{
		if (!m_pTimeManager)
			return;

		int iYear, iMonth, iDay;
		m_pTimeManager.GetDate(iYear, iMonth, iDay);

		if (iDay != m_iCachedDay || iMonth != m_iCachedMonth || iYear != m_iCachedYear)
		{
			m_iCachedDay = iDay;
			m_iCachedMonth = iMonth;
			m_iCachedYear = iYear;

			DebugLog.Info(CALLER_ID, string.Format("Day changed to %1-%2-%3. Invoking OnDayChanged.", iYear, iMonth, iDay));

			if (m_OnDayChanged)
				m_OnDayChanged.Invoke(iDay, iMonth, iYear);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Central ScriptInvoker triggered on each midnight / day transition
	static ScriptInvoker GetOnDayChanged()
	{
		if (!m_OnDayChanged)
			m_OnDayChanged = new ScriptInvoker();
		return m_OnDayChanged;
	}
};
