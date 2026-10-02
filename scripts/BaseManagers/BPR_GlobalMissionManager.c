// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_GlobalMissionManager.c
// Author: Indy & AI Assistant
// Description: Global Base Mission Manager class. Responsible for
//              orchestrating and initializing all global modules.
//              Instantiated by BPR_MainMissionManagerComponent.
// ============================================================================

class BPR_GlobalMissionManager
{
	const static string CALLER_ID = "Global";

	protected bool m_bIsInitialized;

	//------------------------------------------------------------------------------------------------
	//! Initializes global mission logic and will invoke future global modules
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		
		DebugLog.Info(CALLER_ID, "Initializing Global mission manager ...");

		//------------------------------------------------------------------------------------------------
		// Global scripts
		BPR_DateTimeScheduler.Init();
		BPR_SunUtility.Init();
		//------------------------------------------------------------------------------------------------
		
		DebugLog.Info(CALLER_ID, "Global mission manager initialized.");
	}

	//------------------------------------------------------------------------------------------------
	//! Cleans up global modules on mission end / world unload
	void Cleanup()
	{
		DebugLog.Info(CALLER_ID, "Cleaning up Global mission manager ...");

		BPR_SunUtility.Reset();
		BPR_DateTimeScheduler.Reset();

		m_bIsInitialized = false;
	}
};
