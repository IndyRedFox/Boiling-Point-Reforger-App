// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_MainMissionManagerComponent.c
// Author: Indy & AI Assistant
// Description: Main Mission Manager component attached to GameMode entity.
//              Detects Server, Client, LocalHost & Workbench execution.
//              Guards against running in World Editor during editing.
//              Coordinates startup sequence with BPR_MissionLoadingManagerComponent.
//              Initializes Sub-MissionManagers once loading is complete.
// ============================================================================

[ComponentEditorProps(category: "GameScripted/BPR/Component", description: "BPR Main Mission Manager Component")]
class BPR_MainMissionManagerComponentClass : SCR_BaseGameModeComponentClass
{
};

//------------------------------------------------------------------------------------------------
class BPR_MainMissionManagerComponent : SCR_BaseGameModeComponent
{
	const static string CALLER_ID = "Init";

	protected bool m_bIsInitialized;
	protected BPR_MissionLoadingManagerComponent m_pMissionLoadingManager;
	protected ref BPR_GlobalMissionManager m_pGlobalMissionManager;
	protected ref BPR_ServerMissionManager m_pServerMissionManager;
	protected ref BPR_ClientMissionManager m_pClientMissionManager;

	//------------------------------------------------------------------------------------------------
	//! Called after all entities in the world have been loaded and processed
	override void OnWorldPostProcess(World world)
	{
		super.OnWorldPostProcess(world);

		// Prevent execution inside World Editor outside of active play/testing
		if (SCR_Global.IsEditMode())
			return;

		InitManagers();
	}

	//------------------------------------------------------------------------------------------------
	//! Fallback lifecycle event when the game mode starts
	override void OnGameModeStart()
	{
		super.OnGameModeStart();

		// Prevent execution inside World Editor outside of active play/testing
		if (SCR_Global.IsEditMode())
			return;

		InitManagers();
	}

	//------------------------------------------------------------------------------------------------
	//! Determines environment and initializes appropriate base managers
	protected void InitManagers()
	{
		// Guard against re-initialization and World Editor edit mode
		if (m_bIsInitialized || SCR_Global.IsEditMode())
			return;

		m_bIsInitialized = true;

		string sMapName;
		BPR_MapUtility.GetMapName(sMapName);
		
		DebugLog.Info(CALLER_ID, "######################################################################################");		
		DebugLog.Info(CALLER_ID, string.Format("Initializing Mission: %1, Version: %2, Map: %3", BPR_VariablesConfig.MISSION_NAME, BPR_VariablesConfig.MISSION_VERSION, sMapName));

		// Find sibling component BPR_MissionLoadingManagerComponent on GameMode
		BaseGameMode pGameMode = BaseGameMode.Cast(GetOwner());
		if (pGameMode)
			m_pMissionLoadingManager = BPR_MissionLoadingManagerComponent.Cast(pGameMode.FindComponent(BPR_MissionLoadingManagerComponent));

		if (m_pMissionLoadingManager)
		{
			m_pMissionLoadingManager.StartLoading(this);
		}
		else
		{
			DebugLog.Warn(CALLER_ID, "BPR_MissionLoadingManagerComponent not found on GameMode! Launching directly...");
			OnLoadingFinished();
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Called by BPR_MissionLoadingManagerComponent when loading completes (admin release or auto-start timeout)
	void OnLoadingFinished()
	{
		RplMode eSessionMode = RplSession.Mode();
		bool bNeedServer = (eSessionMode != RplMode.Client);
		bool bNeedClient = (eSessionMode != RplMode.Dedicated && !System.IsConsoleApp());

		DebugLog.Info(CALLER_ID, "Loading phase completed. Initializing Sub-MissionManagers...");
		DebugLog.Info(CALLER_ID, string.Format("Server loading: %1 | Client loading: %2", bNeedServer, bNeedClient));

		m_pGlobalMissionManager = new BPR_GlobalMissionManager();
		m_pGlobalMissionManager.Init();		

		if (bNeedServer)
		{
			m_pServerMissionManager = new BPR_ServerMissionManager();
			m_pServerMissionManager.Init();
		}

		if (bNeedClient)
		{
			m_pClientMissionManager = new BPR_ClientMissionManager();
			m_pClientMissionManager.Init();
		}
		
		DebugLog.Info(CALLER_ID, "Main mission manager initialized.");
		DebugLog.Info(CALLER_ID, "######################################################################################");
	}

	//------------------------------------------------------------------------------------------------
	//! Cleanup when GameMode entity or component is destroyed (e.g. mission unload / restart)
	override void OnDelete(IEntity owner)
	{
		if (m_pGlobalMissionManager)
		{
			m_pGlobalMissionManager.Cleanup();
			m_pGlobalMissionManager = null;
		}

		if (m_pServerMissionManager)
		{
			m_pServerMissionManager.Cleanup();
			m_pServerMissionManager = null;
		}

		if (m_pClientMissionManager)
		{
			m_pClientMissionManager.Cleanup();
			m_pClientMissionManager = null;
		}

		m_bIsInitialized = false;

		super.OnDelete(owner);
	}
};
