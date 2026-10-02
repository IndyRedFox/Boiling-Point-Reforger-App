// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ServerMissionManager.c
// Author: Indy & AI Assistant
// Description: Server-side Base Mission Manager class. Responsible for
//              orchestrating and initializing all server-only modules.
//              Instantiated by BPR_MainMissionManagerComponent.
// ============================================================================

class BPR_ServerMissionManager
{
	const static string CALLER_ID = "Server";

	protected bool m_bIsInitialized;
	protected ref BPR_DateAndTimeManager m_pDateAndTimeManager;
	protected ref BPR_WeatherManagerCore m_pWeatherManagerCore;

	//------------------------------------------------------------------------------------------------
	//! Initializes server mission logic, config handler, date/time, and weather managers
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		DebugLog.Info(CALLER_ID, "Initializing Server mission manager ...");
		
		//------------------------------------------------------------------------------------------------
		// Server scripts
		// Date and Time
		m_pDateAndTimeManager = new BPR_DateAndTimeManager();
		m_pDateAndTimeManager.Init();

		// Load WeatherManagerCore for weather system
		m_pWeatherManagerCore = new BPR_WeatherManagerCore();
		m_pWeatherManagerCore.Init();
		//------------------------------------------------------------------------------------------------

		DebugLog.Info(CALLER_ID, "Server mission manager initialized.");
	}

	//------------------------------------------------------------------------------------------------
	//! Cleans up server modules on mission exit / reload
	void Cleanup()
	{
		DebugLog.Info(CALLER_ID, "Cleaning up Server mission manager ...");

		if (m_pDateAndTimeManager)
		{
			m_pDateAndTimeManager = null;
		}

		if (m_pWeatherManagerCore)
		{
			m_pWeatherManagerCore.Cleanup();
			m_pWeatherManagerCore = null;
		}

		BPR_ServerMissionManager.ResetServerModules();

		m_bIsInitialized = false;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets all server-side singletons and providers
	static void ResetServerModules()
	{
		BPR_TemperatureManager.Reset();
		BPR_WindDynamicsProcessor.Reset();
		BPR_FogDynamicsProcessor.Reset();
		BPR_FetchOpenMeteoData.Reset();
	}
};
