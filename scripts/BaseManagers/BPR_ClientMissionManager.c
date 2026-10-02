// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClientMissionManager.c
// Author: Indy & AI Assistant
// Description: Client-side Base Mission Manager class. Responsible for
//              orchestrating and initializing all client-only modules and UI.
//              Instantiated by BPR_MainMissionManagerComponent.
// ============================================================================

class BPR_ClientMissionManager
{
	const static string CALLER_ID = "Client";

	protected bool m_bIsInitialized;

	//------------------------------------------------------------------------------------------------
	//! Initializes client mission logic and will invoke future client modules
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		
		DebugLog.Info(CALLER_ID, "Initializing Client mission manager ...");

		//------------------------------------------------------------------------------------------------
		// Clientscripts
		
		//------------------------------------------------------------------------------------------------
		
		DebugLog.Info(CALLER_ID, "Client mission manager initialized.");
	}

	//------------------------------------------------------------------------------------------------
	//! Cleans up client modules on mission exit / reload
	void Cleanup()
	{
		DebugLog.Info(CALLER_ID, "Cleaning up Client mission manager ...");
		m_bIsInitialized = false;
	}
};
