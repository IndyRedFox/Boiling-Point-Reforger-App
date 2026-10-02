// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherProviderSystem.c
// Author: Indy & AI Assistant
// Description: Server-side System Weather Provider (Mode 1) for Boiling Point Reforger.
//              Resolves start weather (1-4, or random 1-4 when 0),
//              loads initial weather immediately ("Clear", "Cloudy", "Overcast", "Rainy"),
//              and hands off control to the Enfusion Engine automated weather cycle.
// ============================================================================

class BPR_WeatherProviderSystem
{
	const static string CALLER_ID = "WeProSys";

	protected bool m_bIsInitialized;
	protected string m_sStartWeatherState;
	protected TimeAndWeatherManagerEntity m_pWeatherMgr;

	//------------------------------------------------------------------------------------------------
	//! Initializes System Weather Provider with start weather (1-4, or 0 for random)
	void Init(string sStartWeatherState)
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		m_sStartWeatherState = sStartWeatherState;

		// Retrieve TimeAndWeatherManagerEntity
		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "Initialization aborted: TimeAndWeatherManagerEntity not found!");
			return;
		}

		// Force initial weather state immediately (0.0 transition duration, 0.0 state duration)
		if (m_sStartWeatherState == "")
		{
			m_sStartWeatherState = "Clear";
		}
		
		m_pWeatherMgr.ForceWeatherTo(false, m_sStartWeatherState, 0.0, 0.0);

		// Hand over control to Enfusion Engine automatic weather state machine
		m_pWeatherMgr.SetCurrentWeatherLooping(false, 0);

		DebugLog.Info(CALLER_ID, string.Format("Initial weather '%1' loaded immediately. Engine weather control active.", m_sStartWeatherState));

		// Start temperature simulation with initial weather state (Cycle 1)
		BPR_TemperatureManager.GetInstance().StartSimulation(m_sStartWeatherState);
	}
};
