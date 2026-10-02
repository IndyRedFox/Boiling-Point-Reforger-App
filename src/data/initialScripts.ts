import { ScriptFile } from '../types/script';

export const INITIAL_SCRIPTS: ScriptFile[] = [
  // --- Components ---
  {
    id: 'comp_main_manager',
    name: 'BPR_MainMissionManagerComponent.c',
    path: 'Components/BPR_MainMissionManagerComponent.c',
    folder: 'Components',
    status: 'modified',
    description: 'Main Mission Manager component attached to GameMode entity. Detects Server, Client, LocalHost & Workbench execution, guards against World Editor mode, and starts base managers.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-25',
    content: `// ============================================================================
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
`
  },
  {
    id: 'comp_network_manager',
    name: 'BPR_NetworkManagerComponent.c',
    path: 'Components/BPR_NetworkManagerComponent.c',
    folder: 'Components',
    status: 'new',
    description: 'Global network manager component attached to GameMode entity. Handles server-to-all-clients broadcasts and provides decoupled ScriptInvokers.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_NetworkManagerComponent.c
// Author: Indy & AI Assistant
// Description: Global network manager component attached to GameMode entity.
//              Handles server-to-all-clients broadcasts and provides decoupled
//              ScriptInvokers so future scripts do not need to modify this class.
// ============================================================================

[ComponentEditorProps(category: "GameScripted/BPR/Component", description: "BPR Global Network Manager Component")]
class BPR_NetworkManagerComponentClass : SCR_BaseGameModeComponentClass
{
};

//------------------------------------------------------------------------------------------------
class BPR_NetworkManagerComponent : SCR_BaseGameModeComponent
{
	const static string CALLER_ID = "NetwMgr";

	protected static BPR_NetworkManagerComponent s_pInstance;

	protected bool m_bIsInitialized;
	protected ref ScriptInvoker m_OnBroadcastReceived;

	[RplProp(onRplName: "OnRplBaseTemperature")]
	protected float m_fNetworkedBaseTemperature = 15.0;

	protected ref ScriptInvoker m_pOnTemperatureChanged;

	//------------------------------------------------------------------------------------------------
	//! Static singleton getter to access the manager from any script without passing owners
	static BPR_NetworkManagerComponent GetInstance()
	{
		if (!s_pInstance)
		{
			BaseGameMode pGameMode = GetGame().GetGameMode();
			if (pGameMode)
				s_pInstance = BPR_NetworkManagerComponent.Cast(pGameMode.FindComponent(BPR_NetworkManagerComponent));
		}

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! Event invoker for receiving broadcast messages.
	//! Other scripts can subscribe via: BPR_NetworkManagerComponent.GetInstance().GetOnBroadcastReceived().Insert(MyCallback);
	ScriptInvoker GetOnBroadcastReceived()
	{
		if (!m_OnBroadcastReceived)
			m_OnBroadcastReceived = new ScriptInvoker();

		return m_OnBroadcastReceived;
	}

	//------------------------------------------------------------------------------------------------
	//! Event invoker for temperature updates (fires on clients via Rpl and on server via SetBaseTemperature)
	//! Other scripts can subscribe via: BPR_NetworkManagerComponent.GetInstance().GetOnTemperatureChanged().Insert(MyCallback);
	ScriptInvoker GetOnTemperatureChanged()
	{
		if (!m_pOnTemperatureChanged)
			m_pOnTemperatureChanged = new ScriptInvoker();

		return m_pOnTemperatureChanged;
	}

	//------------------------------------------------------------------------------------------------
	//! Returns current networked base temperature (available on server and all clients)
	float GetBaseTemperature()
	{
		return m_fNetworkedBaseTemperature;
	}

	//------------------------------------------------------------------------------------------------
	//! Sets replicated base temperature (Authority/Server only)
	void SetBaseTemperature(float fTemperature)
	{
		if (m_fNetworkedBaseTemperature == fTemperature)
			return;

		m_fNetworkedBaseTemperature = fTemperature;
		Replication.BumpMe();

		if (m_pOnTemperatureChanged)
			m_pOnTemperatureChanged.Invoke(m_fNetworkedBaseTemperature);
	}

	//------------------------------------------------------------------------------------------------
	//! Invoked automatically on clients (and JIP clients) when the replicated temperature changes
	protected void OnRplBaseTemperature()
	{
		if (m_pOnTemperatureChanged)
			m_pOnTemperatureChanged.Invoke(m_fNetworkedBaseTemperature);
	}

	//------------------------------------------------------------------------------------------------
	override void OnGameModeStart()
	{
		super.OnGameModeStart();

		if (SCR_Global.IsEditMode())
			return;

		s_pInstance = this;
		m_bIsInitialized = true;

		DebugLog.Info(CALLER_ID, "Global Network Manager Component initialized.");
	}

	//------------------------------------------------------------------------------------------------
	//! Sends a reliable broadcast from the server to all connected clients
	void BroadcastMessage(BPR_ENetworkMessageType eType, string sPayload = "", int iSenderId = 0)
	{
		RplComponent pRpl = RplComponent.Cast(GetOwner().FindComponent(RplComponent));
		if (!pRpl)
		{
			DebugLog.Err(CALLER_ID, "BroadcastMessage failed: RplComponent missing on GameMode!");
			return;
		}

		Rpc(RpcDo_BroadcastMessage, eType, sPayload, iSenderId);
	}

	//------------------------------------------------------------------------------------------------
	//! RPC executed on all clients when server broadcasts
	[RplRpc(RplChannel.Reliable, RplRcver.Broadcast)]
	protected void RpcDo_BroadcastMessage(BPR_ENetworkMessageType eType, string sPayload, int iSenderId)
	{
		DebugLog.Info(CALLER_ID, string.Format("Received broadcast: Type=%1, Sender=%2", typename.EnumToString(BPR_ENetworkMessageType, eType), iSenderId));

		if (m_OnBroadcastReceived)
			m_OnBroadcastReceived.Invoke(eType, sPayload, iSenderId);
	}
};
`
  },
  {
    id: 'comp_player_network',
    name: 'BPR_PlayerNetworkComponent.c',
    path: 'Components/BPR_PlayerNetworkComponent.c',
    folder: 'Components',
    status: 'modified',
    description: 'Player-specific network component attached to PlayerController. Handles authoritative Client-to-Server requests (RpcAsk) and targeted Server-to-Client responses (RpcDo) for individual players. Provides generic event invokers for server managers.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-25',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_PlayerNetworkComponent.c
// Author: Indy & AI Assistant
// Description: Player-specific network component attached to PlayerController.
//              Handles authoritative Client-to-Server requests (RpcAsk) and
//              targeted Server-to-Client responses (RpcDo) for individual players.
//              Provides generic event invokers for server managers.
// ============================================================================

[ComponentEditorProps(category: "GameScripted/BPR/Component", description: "BPR Player Network Component")]
class BPR_PlayerNetworkComponentClass : ScriptComponentClass
{
};

//------------------------------------------------------------------------------------------------
class BPR_PlayerNetworkComponent : ScriptComponent
{
	const static string CALLER_ID = "PlayNetw";

	protected static ref ScriptInvoker s_OnAnyServerRequestReceived;

	protected PlayerController m_pPlayerController;
	protected ref ScriptInvoker m_OnServerRequestReceived;
	protected ref ScriptInvoker m_OnClientResponseReceived;

	//------------------------------------------------------------------------------------------------
	//! Static helper to obtain the local player's network component from client-side scripts
	static BPR_PlayerNetworkComponent GetLocalPlayerNetworkComponent()
	{
		PlayerController pController = GetGame().GetPlayerController();
		if (!pController)
			return null;

		return BPR_PlayerNetworkComponent.Cast(pController.FindComponent(BPR_PlayerNetworkComponent));
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper to obtain the network component for a specific player ID on the server
	static BPR_PlayerNetworkComponent GetPlayerNetworkComponent(int iPlayerId)
	{
		PlayerManager pManager = GetGame().GetPlayerManager();
		if (!pManager)
			return null;

		PlayerController pController = pManager.GetPlayerController(iPlayerId);
		if (!pController)
			return null;

		return BPR_PlayerNetworkComponent.Cast(pController.FindComponent(BPR_PlayerNetworkComponent));
	}

	//------------------------------------------------------------------------------------------------
	//! Static global invoker notified on server when ANY player sends a request: (eType, sPayload, iPlayerId, pSenderComponent)
	static ScriptInvoker GetOnAnyServerRequestReceived()
	{
		if (!s_OnAnyServerRequestReceived)
			s_OnAnyServerRequestReceived = new ScriptInvoker();

		return s_OnAnyServerRequestReceived;
	}

	//------------------------------------------------------------------------------------------------
	override void OnPostInit(IEntity owner)
	{
		super.OnPostInit(owner);
		m_pPlayerController = PlayerController.Cast(owner);
	}

	//------------------------------------------------------------------------------------------------
	//! Instance invoker for requests received from this specific player controller
	ScriptInvoker GetOnServerRequestReceived()
	{
		if (!m_OnServerRequestReceived)
			m_OnServerRequestReceived = new ScriptInvoker();

		return m_OnServerRequestReceived;
	}

	//------------------------------------------------------------------------------------------------
	//! Instance invoker for responses received on this client
	ScriptInvoker GetOnClientResponseReceived()
	{
		if (!m_OnClientResponseReceived)
			m_OnClientResponseReceived = new ScriptInvoker();

		return m_OnClientResponseReceived;
	}

	//------------------------------------------------------------------------------------------------
	//! Called by Client to request an action from Server
	void SendRequestToServer(BPR_ENetworkMessageType eType, string sPayload = "")
	{
		Rpc(RpcAsk_ServerRequest, eType, sPayload);
	}

	//------------------------------------------------------------------------------------------------
	//! Called by Server to respond only to this individual player (Owner)
	void SendResponseToClient(BPR_ENetworkMessageType eType, string sPayload = "")
	{
		Rpc(RpcDo_ClientResponse, eType, sPayload);
	}

	//------------------------------------------------------------------------------------------------
	//! RPC executed on Server when client requests an action
	[RplRpc(RplChannel.Reliable, RplRcver.Server)]
	protected void RpcAsk_ServerRequest(BPR_ENetworkMessageType eType, string sPayload)
	{
		int iPlayerId = 0;

		if (m_pPlayerController)
			iPlayerId = m_pPlayerController.GetPlayerId();

		DebugLog.Info(CALLER_ID, string.Format("Server received request from PlayerId %1: Type=%2", iPlayerId, typename.EnumToString(BPR_ENetworkMessageType, eType)));

		if (m_OnServerRequestReceived)
			m_OnServerRequestReceived.Invoke(eType, sPayload, iPlayerId);

		if (s_OnAnyServerRequestReceived)
			s_OnAnyServerRequestReceived.Invoke(eType, sPayload, iPlayerId, this);
	}

	//------------------------------------------------------------------------------------------------
	//! RPC executed on the specific Client when server sends a private response
	[RplRpc(RplChannel.Reliable, RplRcver.Owner)]
	protected void RpcDo_ClientResponse(BPR_ENetworkMessageType eType, string sPayload)
	{
		DebugLog.Info(CALLER_ID, string.Format("Client received response from Server: Type=%1", typename.EnumToString(BPR_ENetworkMessageType, eType)));

		if (m_OnClientResponseReceived)
			m_OnClientResponseReceived.Invoke(eType, sPayload);
	}
};
`
  },
    {
    id: 'comp_mission_loading_manager',
    name: 'BPR_MissionLoadingManagerComponent.c',
    path: 'Components/BPR_MissionLoadingManagerComponent.c',
    folder: 'Components',
    status: 'modified',
    description: 'GameMode component coordinating loading sequence, 2.5s launch delay, Open-Meteo retrieval trigger, and dialog synchronization.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_MissionLoadingManagerComponent.c
// Author: Indy & AI Assistant
// Description: GameMode component coordinating the mission loading sequence.
//              - Replicates loading state (m_eLoadingState) and admin ID (m_iSetupAdminPlayerId).
//              - Server loads ServerConfig and runs auto-start fallback timer.
//              - Listens for REQUEST_SERVER_CONFIG and serves packed config payloads.
//              - First Admin cancels timer and opens ParameterSetupDialog.
//              - Normal clients and subsequent admins open ClientLoadingDialog.
//              - Blocks character controls and activates MenuContext during loading.
//              - Orchestrates mission launch sequence with a 2.5s launch delay:
//                Triggers FetchOMData for weather modes 3 & 4 and prepares climate cascade.
//              - Closes dialogs and restores controls upon completion.
// ============================================================================

[ComponentEditorProps(category: "GameScripted/BPR/Component", description: "BPR Mission Loading Manager Component")]
class BPR_MissionLoadingManagerComponentClass : SCR_BaseGameModeComponentClass
{
};

//------------------------------------------------------------------------------------------------
class BPR_MissionLoadingManagerComponent : SCR_BaseGameModeComponent
{
	const static string CALLER_ID = "LoadMgr";

	[RplProp(onRplName: "OnRplLoadingState")]
	protected int m_eLoadingState = BPR_EMissionLoadingState.INACTIVE;

	[RplProp(onRplName: "OnRplSetupAdminPlayerId")]
	protected int m_iSetupAdminPlayerId = -1;

	protected float m_fAutoStartDelay = 10.0;
	protected float m_fMissionLaunchDelay = 2.5;
	protected bool m_bControlsBlocked;
	protected BPR_MainMissionManagerComponent m_pMainManager;

	//------------------------------------------------------------------------------------------------
	//! Static helper to obtain this component from GameMode
	static BPR_MissionLoadingManagerComponent GetInstance()
	{
		BaseGameMode pGameMode = GetGame().GetGameMode();
		if (!pGameMode)
			return null;

		return BPR_MissionLoadingManagerComponent.Cast(pGameMode.FindComponent(BPR_MissionLoadingManagerComponent));
	}

	//------------------------------------------------------------------------------------------------
	//! Sets replicated loading state (Authority only)
	void SetLoadingState(BPR_EMissionLoadingState eState)
	{
		m_eLoadingState = eState;
		Replication.BumpMe();
	}

	//------------------------------------------------------------------------------------------------
	//! Sets replicated setup admin player ID (Authority only)
	void SetSetupAdminPlayerId(int iPlayerId)
	{
		m_iSetupAdminPlayerId = iPlayerId;
		Replication.BumpMe();
	}

	//------------------------------------------------------------------------------------------------
	//! Returns current mission loading state
	BPR_EMissionLoadingState GetLoadingState()
	{
		return m_eLoadingState;
	}

	//------------------------------------------------------------------------------------------------
	//! Returns current setup admin player ID
	int GetSetupAdminPlayerId()
	{
		return m_iSetupAdminPlayerId;
	}

	//------------------------------------------------------------------------------------------------
	//! Invoked on client proxies when loading state replicates
	protected void OnRplLoadingState()
	{
		if (m_eLoadingState == BPR_EMissionLoadingState.FINISHED)
		{
			BPR_ClientLoadingDialog.CloseDialog();
			BPR_ParameterSetupDialog.CloseDialog();
			SetCharacterControlBlocked(false);

			if (m_pMainManager)
				m_pMainManager.OnLoadingFinished();
		}
		else if (m_eLoadingState == BPR_EMissionLoadingState.LOADING)
		{
			UpdateClientLoadingState();
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Invoked on client proxies when setup admin ID replicates
	protected void OnRplSetupAdminPlayerId()
	{
		UpdateClientLoadingState();
	}

	//------------------------------------------------------------------------------------------------
	//! Starts the mission loading routine
	void StartLoading(BPR_MainMissionManagerComponent pMainManager)
	{
		m_pMainManager = pMainManager;

		RplMode eSessionMode = RplSession.Mode();
		bool bIsServer = (eSessionMode != RplMode.Client);
		bool bIsClient = (eSessionMode != RplMode.Dedicated && !System.IsConsoleApp());

		// 1. Server initialization
		if (bIsServer)
		{
			SetLoadingState(BPR_EMissionLoadingState.LOADING);

			// Load ServerConfig on server
			BPR_JsonConfigHandler.InitConfig();

			// Start Open-Meteo connectivity pre-flight check in background
			BPR_FetchOpenMeteoData.GetInstance().StartConnectivityCheck();

			// Listen for network requests from clients
			BPR_PlayerNetworkComponent.GetOnAnyServerRequestReceived().Insert(OnServerNetworkRequest);

			// Arm server fallback timer
			int iDelayMs = Math.Round(m_fAutoStartDelay * 1000.0);
			GetGame().GetCallqueue().CallLater(OnAutoStartTimeout, iDelayMs, false);
			DebugLog.Info(CALLER_ID, string.Format("%1", BPR_VariablesConfig.SEPERATOR_02));
			DebugLog.Info(CALLER_ID, string.Format("Server armed auto-start fallback timer for %1 s.", m_fAutoStartDelay));

			// Listen for player connections on dedicated server to register first admin
			if (eSessionMode == RplMode.Dedicated)
			{
				SCR_BaseGameMode pGameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
				if (pGameMode)
					pGameMode.GetOnPlayerConnected().Insert(OnPlayerConnectedServer);
			}
		}

		// 2. Client initialization (including listen server and Workbench)
		if (bIsClient)
		{
			SetCharacterControlBlocked(true);

			// Check role once player controller is ready
			GetGame().GetCallqueue().CallLater(UpdateClientLoadingState, 100, false);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Server listener for incoming requests from any player network component
	protected void OnServerNetworkRequest(BPR_ENetworkMessageType eType, string sPayload, int iPlayerId, BPR_PlayerNetworkComponent pSenderComponent)
	{
		if (eType == BPR_ENetworkMessageType.REQUEST_SERVER_CONFIG)
		{
			string sResponsePayload = BPR_JsonConfigHandler.PackConfigPayload();
			if (pSenderComponent)
			{
				pSenderComponent.SendResponseToClient(BPR_ENetworkMessageType.RESPONSE_SERVER_CONFIG, sResponsePayload);
				DebugLog.Info(CALLER_ID, string.Format("Sent ServerConfig payload to PlayerID %1.", iPlayerId));
			}
		}
		else if (eType == BPR_ENetworkMessageType.REQUEST_SAVE_CONFIG)
		{
			ref array<string> aParams = new array<string>();
			sPayload.Split(";", aParams, false);

			ref BPR_ServerConfig pSaveConfig = new BPR_ServerConfig();
			pSaveConfig.FromParamArray(aParams);

			BPR_JsonConfigHandler.SetConfig(pSaveConfig);
			bool bSaveSuccess = BPR_JsonConfigHandler.SaveActiveConfigToFile();

			if (pSenderComponent)
			{
				string sResponse = "error";
				if (bSaveSuccess)
					sResponse = "ok";

				pSenderComponent.SendResponseToClient(BPR_ENetworkMessageType.RESPONSE_SAVE_CONFIG, sResponse);
				DebugLog.Info(CALLER_ID, string.Format("Processed REQUEST_SAVE_CONFIG from PlayerID %1 -> Result: %2", iPlayerId, sResponse));
			}
		}
		else if (eType == BPR_ENetworkMessageType.CONFIRM_START_MISSION)
		{
			ref array<string> aStartParams = new array<string>();
			sPayload.Split(";", aStartParams, false);

			ref BPR_ServerConfig pStartConfig = new BPR_ServerConfig();
			pStartConfig.FromParamArray(aStartParams);

			// Update in-memory active server configuration ONLY (no file overwrite!)
			BPR_JsonConfigHandler.SetConfig(pStartConfig);
			DebugLog.Info(CALLER_ID, string.Format("Processed CONFIRM_START_MISSION from PlayerID %1 -> Initiating launch with active RAM config.", iPlayerId));

			InitiateMissionLaunch();
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Server-side event when a player connects to dedicated server
	protected void OnPlayerConnectedServer(int iPlayerId)
	{
		if (m_eLoadingState != BPR_EMissionLoadingState.LOADING)
			return;

		if (m_iSetupAdminPlayerId != -1)
			return;

		PlayerManager pPlayerManager = GetGame().GetPlayerManager();
		if (pPlayerManager && pPlayerManager.HasPlayerRole(iPlayerId, EPlayerRole.ADMINISTRATOR))
		{
			SetSetupAdminPlayerId(iPlayerId);
			GetGame().GetCallqueue().Remove(OnAutoStartTimeout);
			DebugLog.Info(CALLER_ID, string.Format("First admin joined (PlayerID: %1). Auto-start timer cancelled.", iPlayerId));
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Checks whether the local player has admin privileges
	protected bool IsLocalPlayerAdmin()
	{
		// Singleplayer / Workbench without Server Localhost -> Always Admin
		if (RplSession.Mode() == RplMode.None)
			return true;

		PlayerController pPlayerController = GetGame().GetPlayerController();
		if (pPlayerController && pPlayerController.HasRole(EPlayerRole.ADMINISTRATOR))
			return true;

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates local player role and shows the matching dialog
	protected void UpdateClientLoadingState()
	{
		if (m_eLoadingState != BPR_EMissionLoadingState.LOADING)
			return;

		bool bIsAdmin = IsLocalPlayerAdmin();
		int iLocalPlayerId = SCR_PlayerController.GetLocalPlayerId();

		// 1st Admin handling: If an admin already took the setup slot, subsequent admins become regular clients
		if (bIsAdmin && m_iSetupAdminPlayerId != -1 && iLocalPlayerId != m_iSetupAdminPlayerId && RplSession.Mode() != RplMode.None)
		{
			bIsAdmin = false;
			DebugLog.Info(CALLER_ID, "Another admin is already configuring the mission. Opening Client Loading Dialog.");
		}

		if (bIsAdmin)
		{
			// If local host admin, update setup admin ID and cancel timer
			if (m_iSetupAdminPlayerId == -1 && RplSession.Mode() != RplMode.Client)
			{
				SetSetupAdminPlayerId(iLocalPlayerId);
				GetGame().GetCallqueue().Remove(OnAutoStartTimeout);
			}

			// Show Client Loading Dialog for 1.2s to mask pre-flight connectivity check
			BPR_ClientLoadingDialog.OpenDialog();
			GetGame().GetCallqueue().CallLater(OpenAdminSetupDialog, 1200, false);
			DebugLog.Info(CALLER_ID, "Local player is admin -> Scheduled Parameter Setup Dialog after pre-flight delay (1.2s).");
		}
		else
		{
			BPR_ParameterSetupDialog.CloseDialog();
			BPR_ClientLoadingDialog.OpenDialog();
			DebugLog.Info(CALLER_ID, "Local player is client -> Opened Client Loading Dialog.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Seamlessly transitions from loading screen to ParameterSetupDialog for admin
	protected void OpenAdminSetupDialog()
	{
		if (m_eLoadingState != BPR_EMissionLoadingState.LOADING)
			return;

		BPR_ClientLoadingDialog.CloseDialog();
		BPR_ParameterSetupDialog.OpenDialog();
		DebugLog.Info(CALLER_ID, "Pre-flight delay completed -> Opened Parameter Setup Dialog.");
	}

	//------------------------------------------------------------------------------------------------
	//! Blocks or reactivates character controls and input context
	void SetCharacterControlBlocked(bool bBlocked)
	{
		m_bControlsBlocked = bBlocked;

		PlayerController pPlayerController = GetGame().GetPlayerController();
		if (pPlayerController)
		{
			IEntity pControlledEntity = pPlayerController.GetControlledEntity();
			if (pControlledEntity)
			{
				CharacterControllerComponent pCharController = CharacterControllerComponent.Cast(pControlledEntity.FindComponent(CharacterControllerComponent));
				if (pCharController)
				{
					pCharController.SetDisableMovementControls(bBlocked);
					pCharController.SetDisableViewControls(bBlocked);
					pCharController.SetDisableWeaponControls(bBlocked);
				}
			}
		}

		InputManager pInputManager = GetGame().GetInputManager();
		if (pInputManager)
		{
			if (bBlocked)
				pInputManager.ActivateContext("MenuContext");
			else
				pInputManager.ResetContext("MenuContext");
		}

		DebugLog.Info(CALLER_ID, string.Format("Character control blocked: %1", bBlocked));
	}

	//------------------------------------------------------------------------------------------------
	//! Server callback when auto-start timer expires without an admin
	protected void OnAutoStartTimeout()
	{
		if (m_eLoadingState != BPR_EMissionLoadingState.LOADING)
			return;

		DebugLog.Info(CALLER_ID, "Auto-start timer expired without admin. Launching mission...");
		InitiateMissionLaunch();
	}

	//------------------------------------------------------------------------------------------------
	//! Initiates mission launch with a 2.5s delay to allow async API queries and world init
	void InitiateMissionLaunch()
	{
		RplMode eSessionMode = RplSession.Mode();
		bool bIsServer = (eSessionMode != RplMode.Client);

		if (bIsServer)
		{
			GetGame().GetCallqueue().Remove(OnAutoStartTimeout);

			BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
			if (!pConfig)
				pConfig = new BPR_ServerConfig();

			// 1. Weather Mode 3 & 4: Start Open-Meteo Weather Forecast retrieval
			if (pConfig.iWeatherMode == 3 || pConfig.iWeatherMode == 4)
			{
				float fLat = 999.0;
				float fLon = 999.0;
				if (pConfig.iWeatherMode == 4 && pConfig.sCoordinates != "")
				{
					BPR_MapUtility.ParseCoordinates(pConfig.sCoordinates, fLat, fLon);
				}

				BPR_FetchOpenMeteoData.GetInstance().StartFetching(fLat, fLon);
				DebugLog.Info(CALLER_ID, string.Format("InitiateMissionLaunch: Started Open-Meteo forecast retrieval (Mode: %1).", pConfig.iWeatherMode));
			}

			// 2. Kaskadenabfrage fuer TemperatureManager (Stufe 1-4) im Speicher vorbereiten (Zyklen ruhen noch)
			BPR_TemperatureManager.GetInstance().ResolveClimateCascade();

			// 3. Delay of 2.5 seconds before final mission release
			int iDelayMs = Math.Round(m_fMissionLaunchDelay * 1000.0);
			DebugLog.Info(CALLER_ID, string.Format("Mission launch sequence started. Waiting %1 s delay for weather/managers...", m_fMissionLaunchDelay));
			GetGame().GetCallqueue().CallLater(FinishLoading, iDelayMs, false);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Completes loading: switches state to FINISHED, unlocks controls, and closes dialogs
	void FinishLoading()
	{
		RplMode eSessionMode = RplSession.Mode();
		bool bIsServer = (eSessionMode != RplMode.Client);
		bool bIsClient = (eSessionMode != RplMode.Dedicated);

		if (bIsServer)
		{
			GetGame().GetCallqueue().Remove(OnAutoStartTimeout);
			GetGame().GetCallqueue().Remove(FinishLoading);

			SCR_BaseGameMode pGameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
			if (pGameMode)
				pGameMode.GetOnPlayerConnected().Remove(OnPlayerConnectedServer);

			BPR_PlayerNetworkComponent.GetOnAnyServerRequestReceived().Remove(OnServerNetworkRequest);

			SetLoadingState(BPR_EMissionLoadingState.FINISHED);
		}

		// Close dialogs and release controls on client
		if (bIsClient)
		{
			BPR_ClientLoadingDialog.CloseDialog();
			BPR_ParameterSetupDialog.CloseDialog();
			SetCharacterControlBlocked(false);
		}

		DebugLog.Info(CALLER_ID, "Mission loading completed.");
		DebugLog.Info(CALLER_ID, string.Format("%1", BPR_VariablesConfig.SEPERATOR_02));

		if (m_pMainManager)
			m_pMainManager.OnLoadingFinished();
	}
};
`
  },

  // --- BaseManagers ---
  {
    id: 'base_global_manager',
    name: 'BPR_GlobalMissionManager.c',
    path: 'BaseManagers/BPR_GlobalMissionManager.c',
    folder: 'BaseManagers',
    status: 'clean',
    description: 'Global Base Mission Manager class. Responsible for orchestrating and initializing all global modules. Instantiated by BPR_MainMissionManagerComponent.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
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
`
  },
  {
    id: 'base_server_manager',
    name: 'BPR_ServerMissionManager.c',
    path: 'BaseManagers/BPR_ServerMissionManager.c',
    folder: 'BaseManagers',
    status: 'clean',
    description: 'Server-side Base Mission Manager class. Responsible for orchestrating and initializing all server-only modules. Instantiated by BPR_MainMissionManagerComponent.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
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
`
  },
  {
    id: 'base_client_manager',
    name: 'BPR_ClientMissionManager.c',
    path: 'BaseManagers/BPR_ClientMissionManager.c',
    folder: 'BaseManagers',
    status: 'clean',
    description: 'Client-side Base Mission Manager class. Responsible for orchestrating and initializing all client-only modules and UI. Instantiated by BPR_MainMissionManagerComponent.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
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
`
  },

  // --- Configs ---
  {
    id: 'cfg_network_enums',
    name: 'BPR_NetworkEnums.c',
    path: 'Configs/BPR_NetworkEnums.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Network message type enumerations (BPR_ENetworkMessageType) for client-server RPC communication.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-26',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_NetworkEnums.c
// Author: Indy & AI Assistant
// Description: Network enumerations for BPR client-server communication.
// ============================================================================

enum BPR_ENetworkMessageType
{
	NONE = 0,
	MISSION_STATE_UPDATE,
	NOTIFICATION_POPUP,
	PLAYER_DATA_SYNC,
	SOUND_TRIGGER,
	CUSTOM_EVENT,
	REQUEST_SERVER_CONFIG,
	RESPONSE_SERVER_CONFIG,
	REQUEST_SAVE_CONFIG,
	RESPONSE_SAVE_CONFIG,
	CONFIRM_START_MISSION
};

enum BPR_EMissionLoadingState
{
	INACTIVE = 0,
	LOADING,
	FINISHED
};

enum BPR_EOpenMeteoStatus
{
	UNKNOWN = 0,
	AVAILABLE,
	CLI_PARAM_MISSING,
	REST_DISABLED,
	TIMEOUT_FIREWALL,
	API_ERROR
};
`
  },
  {
    id: 'cfg_variables',
    name: 'BPR_VariablesConfig.c',
    path: 'Configs/BPR_VariablesConfig.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Definition of general global variables and mission configurations.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_VariablesConfig.c
// Author: Indy & AI Assistant
// Description: Definition of general global variables.
// ============================================================================

class BPR_VariablesConfig
{
	const static string CALLER_ID = "VarConf";
		
	const static string MISSION_NAME = "Boiling Point Reforger";
	const static string MISSION_VERSION = "0.1.0";
	
	const static string CONFIG_DIR = "$profile:BoilingPointReforger/";
	
	// Only used when the actual coordinates are useless (e.g. Everon in the middle of the Atlantic)
	// Leave blank if not used.
	const static string OVERRIDE_COORDS = "37.745, -25.699"; 
	const static string OVERRIDE_LOCATION = "Azores";
};
`
  },
  {
    id: 'cfg_server_config',
    name: 'BPR_ServerConfig.c',
    path: 'Configs/BPR_ServerConfig.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Server configuration data structure for Boiling Point Reforger. Holds customizable mission parameters with default values and JSON serialization/deserialization.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-26',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ServerConfig.c
// Author: Indy & AI Assistant
// Description: Server configuration data structure for Boiling Point Reforger.
//              Holds customizable mission parameters with default values.
// ============================================================================

class BPR_ServerConfig
{
	const static string CALLER_ID = "ServCfg";

	// --- Internal Enforce Script Variables (Strict Hungarian Notation) ---
	string sVersion = "0.0.1";
	ref array<string> aDescription;
	ref array<string> aInfoDate;
	ref array<string> aInfoTime;
	ref array<string> aInfoWeather;
	ref array<string> aInfoAmbient;
	ref array<string> aInfoAdmin;

	int iDateMode = 2;
	string sStartDate = "16.11.2023";
	
	int iTimeMode = 3;
	int iTimezoneUTC = 0;
	bool bSummerTime = false;
	int iCustomHour = 12;

	int iWeatherMode = 1;
	int iStartWeather = 0;
	int iWeatherTransitions = 0;
	int iTransitionTime = 0;
	string sCoordinates = "50.0755, 14.4378";
	
	int iAmbientFactor = 4;
	
	bool bDebugMode = false;

	// ------------------------------------------------------------------------
	// Constructor: Default Header Descriptions
	// ------------------------------------------------------------------------
	void BPR_ServerConfig()
	{
		aDescription = new array<string>();
		aDescription.Insert("--- Boiling Point Reforger SERVER CONFIG Description ---");
		aDescription.Insert("Use this file (or Parametersetup Dialog in Mission) to change the mission parameters.");
		aDescription.Insert("Make changes carefully. Only change values of the variables.");
		aDescription.Insert("Ensure the same data type when making changes. Invalid variables are replaced by default values.");
		aDescription.Insert("Changes to the variable name or the structure result in errors and default values are used.");
		aDescription.Insert("If you encounter problems, delete the file so a new one is created when the mission starts.");
		aDescription.Insert("---------------------------------------");

		aInfoDate = new array<string>();
		aInfoDate.Insert("--- SELECT MISSION DATE ---");
		aInfoDate.Insert("DateMode: 1. Mission date; 2. UTC date; 3. Free date");
		aInfoDate.Insert("StartDate: Enter the date you want to play, day/month/year (Format dd.mm.yyyy).");
		aInfoDate.Insert("---------------------------------------");

		aInfoTime = new array<string>();
		aInfoTime.Insert("--- SELECT MISSION TIME ---");
		aInfoTime.Insert("TimeMode: 1. UTC time; 2. Choose hour of day; 3. Random hour; 4. Maptime (Time the map is located in the world)");
		aInfoTime.Insert("TimezoneUTC: Change the UTC timezone (-12 to 14)");
		aInfoTime.Insert("SummerTime: Select true for summertime (+1 hour). Must be switched (false) manually in winter.");
		aInfoTime.Insert("CustomHour: Enter the hour you want to start. (0 - 23)");
		aInfoTime.Insert("---------------------------------------");

		aInfoWeather = new array<string>();
		aInfoWeather.Insert("--- SELECT MISSION WEATHER ---");
		aInfoWeather.Insert("WeatherMode: 1. System weather; 2. Simple weather; 3. Map weather (Lat/Lon); 4. Own weather (Lat/Lon)");
		aInfoWeather.Insert("Mode 3. + 4. requires '-restapi=api.open-meteo.com' in the startoptions,");
		aInfoWeather.Insert("alternate '-restapi=*' (not recommended; allows access to insecure sites).");
		aInfoWeather.Insert("StartWeather: 0. Random; 1. Clear; 2. Cloudy; 3. Overcast; 4. Rainy");
		aInfoWeather.Insert("WeatherTransitions: 0. Random; 1. Never; 2. 60 min; 3. 30 min; 4. 10 min");
		aInfoWeather.Insert("TransitionTime: 0. Random; 1. 30 min; 2. 15 min; 3. 7.5 min; 4. 5 min");
		aInfoWeather.Insert("Coordinates: Your own coordinates (Lat/Lon) e.g. 50.0755, 14.4378 to load your own weather");
		aInfoWeather.Insert("---------------------------------------");
		
		aInfoAmbient = new array<string>();
		aInfoAmbient.Insert("--- SELECT AMBIENT DENSITY ---");
		aInfoAmbient.Insert("Controls civilian, worker, animal and traffic density.");
		aInfoAmbient.Insert("AmbientFactor: 1. Off (0%); 2. Low (33%); 3. Medium (66%); 4. Normal (100%); 5. High (125%); 6. Ultra (150%)");
		aInfoAmbient.Insert("---------------------------------------");
		
		aInfoAdmin = new array<string>();
		aInfoAdmin.Insert("--- ADMIN SETUP ---");
	}

	// ------------------------------------------------------------------------
	// Serialization: Save to JSON File
	// Internal Hungarian variables mapped to clean JSON keys
	// ------------------------------------------------------------------------
	bool SaveToFile(string sFilePath)
	{
		ref PrettyJsonSaveContext saveContext = new PrettyJsonSaveContext();

		saveContext.WriteValue("Config Version", sVersion);
		saveContext.WriteValue("DESCRIPTION", aDescription);
		saveContext.WriteValue("INFORMATION DATE", aInfoDate);
		saveContext.WriteValue("INFORMATION TIME", aInfoTime);
		saveContext.WriteValue("INFORMATION WEATHER", aInfoWeather);
		saveContext.WriteValue("INFORMATION AMBIENT", aInfoAmbient);
		saveContext.WriteValue("INFORMATION ADMIN", aInfoAdmin);
		saveContext.WriteValue("DateMode", iDateMode);
		saveContext.WriteValue("StartDate", sStartDate);
		saveContext.WriteValue("TimeMode", iTimeMode);
		saveContext.WriteValue("TimezoneUTC", iTimezoneUTC);
		saveContext.WriteValue("SummerTime", bSummerTime);
		saveContext.WriteValue("CustomHour", iCustomHour);
		saveContext.WriteValue("WeatherMode", iWeatherMode);
		saveContext.WriteValue("StartWeather", iStartWeather);
		saveContext.WriteValue("WeatherTransitions", iWeatherTransitions);
		saveContext.WriteValue("TransitionTime", iTransitionTime);
		saveContext.WriteValue("Coordinates", sCoordinates);
		saveContext.WriteValue("AmbientFactor", iAmbientFactor);
		saveContext.WriteValue("DebugMode", bDebugMode);

		return saveContext.SaveToFile(sFilePath);
	}

	// ------------------------------------------------------------------------
	// Deserialization: Load from JSON File
	// Clean JSON keys read into internal Hungarian variables
	// ------------------------------------------------------------------------
	bool LoadFromFile(string sFilePath)
	{
		ref JsonLoadContext loadContext = new JsonLoadContext();
		if (!loadContext.LoadFromFile(sFilePath))
			return false;

		loadContext.ReadValue("Config Version", sVersion);
		loadContext.ReadValue("DESCRIPTION", aDescription);
		loadContext.ReadValue("INFORMATION DATE", aInfoDate);
		loadContext.ReadValue("INFORMATION TIME", aInfoTime);
		loadContext.ReadValue("INFORMATION WEATHER", aInfoWeather);
		loadContext.ReadValue("INFORMATION AMBIENT", aInfoAmbient);
		loadContext.ReadValue("INFORMATION ADMIN", aInfoAdmin);
		loadContext.ReadValue("DateMode", iDateMode);
		loadContext.ReadValue("StartDate", sStartDate);
		loadContext.ReadValue("TimeMode", iTimeMode);
		loadContext.ReadValue("TimezoneUTC", iTimezoneUTC);
		loadContext.ReadValue("SummerTime", bSummerTime);
		loadContext.ReadValue("CustomHour", iCustomHour);
		loadContext.ReadValue("WeatherMode", iWeatherMode);
		loadContext.ReadValue("StartWeather", iStartWeather);
		loadContext.ReadValue("WeatherTransitions", iWeatherTransitions);
		loadContext.ReadValue("TransitionTime", iTransitionTime);
		loadContext.ReadValue("Coordinates", sCoordinates);
		loadContext.ReadValue("AmbientFactor", iAmbientFactor);
		loadContext.ReadValue("DebugMode", bDebugMode);

		return true;
	}

	// ------------------------------------------------------------------------
	// Network serialization: Packs configuration parameters into a string array for RPC transmission
	// ------------------------------------------------------------------------
	ref array<string> ToParamArray()
	{
		ref array<string> aParams = new array<string>();
		aParams.Insert(iDateMode.ToString());
		aParams.Insert(sStartDate);
		aParams.Insert(iTimeMode.ToString());
		aParams.Insert(iTimezoneUTC.ToString());
		aParams.Insert(bSummerTime.ToString());
		aParams.Insert(iCustomHour.ToString());
		aParams.Insert(iWeatherMode.ToString());
		aParams.Insert(iStartWeather.ToString());
		aParams.Insert(iWeatherTransitions.ToString());
		aParams.Insert(iTransitionTime.ToString());
		aParams.Insert(sCoordinates);
		aParams.Insert(iAmbientFactor.ToString());
		aParams.Insert(bDebugMode.ToString());
		return aParams;
	}

	// ------------------------------------------------------------------------
	// Network deserialization: Unpacks configuration parameters from a string array
	// ------------------------------------------------------------------------
	void FromParamArray(notnull array<string> aParams)
	{
		int iCount = aParams.Count();
		int iIdx = 0; // Startindex
		string sVal = "";
		
		if (iIdx < iCount) iDateMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) sStartDate = aParams[iIdx++];
		if (iIdx < iCount) iTimeMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iTimezoneUTC = aParams[iIdx++].ToInt();
		if (iIdx < iCount)
		{
			sVal = aParams[iIdx++];
			bSummerTime = (sVal == "true" || sVal == "1");
		}
		if (iIdx < iCount) iCustomHour = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iWeatherMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iStartWeather = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iWeatherTransitions = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iTransitionTime = aParams[iIdx++].ToInt();
		if (iIdx < iCount) sCoordinates = aParams[iIdx++];
		if (iIdx < iCount) iAmbientFactor = aParams[iIdx++].ToInt();
		if (iIdx < iCount)
		{
			sVal = aParams[iIdx++];
			bDebugMode = (sVal == "true" || sVal == "1");
		}
	}
};
`
  },

  // --- Utilities/Global ---
  {
    id: 'util_global_debuglog',
    name: 'BPR_DebugLog.c',
    path: 'Utilities/Global/BPR_DebugLog.c',
    folder: 'Utilities/Global',
    status: 'modified',
    description: 'Global helper class for formatted BPR debug log entries. Outputs logs with "####### DEBUG BPR [Timestamp][Caller] Message".',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_DebugLog.c
// Author: Indy & AI Assistant
// Description: Global helper class for formatted BPR debug log entries.
//              Outputs logs with "####### DEBUG BPR [Timestamp][Caller] Message".
// ============================================================================

class DebugLog : Managed
{
	const static string PREFIX = "####### DEBUG BPR";
	const static string CALLER_ID = "DebLog";

	//------------------------------------------------------------------------------------------------
	//! Returns the current timestamp (real-time HH:MM:SS) as a string.
	static string GetTimestamp()
	{
		int iHour, iMinute, iSecond;
		System.GetHourMinuteSecond(iHour, iMinute, iSecond);
		
		string sTimeStamp = BPR_DateTimeUtility.FormatTime(iHour, iMinute, iSecond);	

		return string.Format("[%1]", sTimeStamp);
	}

	//------------------------------------------------------------------------------------------------
	//! Log informative message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] Message
	static void Info(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.NORMAL);
	}

	//------------------------------------------------------------------------------------------------
	//! Log warning message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] WARNING Message
	static void Warning(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] WARNING %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.WARNING);
	}

	//! Convenient alias for Warning
	static void Warn(string sCaller, string sMessage)
	{
		Warning(sCaller, sMessage);
	}

	//------------------------------------------------------------------------------------------------
	//! Log error message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] ERROR Message
	static void Error(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] ERROR %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.ERROR);
	}

	//! Convenient alias for Error
	static void Err(string sCaller, string sMessage)
	{
		Error(sCaller, sMessage);
	}
};
`
  },
  {
    id: 'util_global_datetime',
    name: 'BPR_DateTimeUtility.c',
    path: 'Utilities/Global/BPR_DateTimeUtility.c',
    folder: 'Utilities/Global',
    status: 'new',
    description: 'Global utility class for date/time parsing, leap year calculation, days per month validation, and formatting.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_DateTimeUtility.c
// Author: Indy & AI Assistant
// Description: Global utility class for date and time parsing, validation,
//              and formatting. Validates leap years, days per month,
//              hours, minutes, seconds, and durations.
// ============================================================================

class BPR_DateTimeUtility
{
	const static string CALLER_ID = "DatTimUti";

	const static int MIN_VALID_YEAR = 1900;
	const static int MAX_VALID_YEAR = 2100;

	//------------------------------------------------------------------------------------------------
	//! Checks if a given year is a leap year (Schaltjahr)
	//! Rule: divisible by 4, but not by 100, unless divisible by 400
	static bool IsLeapYear(int iYear)
	{
		if (iYear <= 0)
			return false;

		return ((iYear % 4 == 0 && iYear % 100 != 0) || (iYear % 400 == 0));
	}

	//------------------------------------------------------------------------------------------------
	//! Returns the maximum number of days in a given month and year
	static int GetDaysInMonth(int iMonth, int iYear)
	{
		if (iMonth < 1 || iMonth > 12)
			return 0;

		switch (iMonth)
		{
			case 1:
			case 3:
			case 5:
			case 7:
			case 8:
			case 10:
			case 12:
				return 31;

			case 4:
			case 6:
			case 9:
			case 11:
				return 30;

			case 2:
				if (IsLeapYear(iYear))
					return 29;
				return 28;
		}

		return 0;
	}

	//------------------------------------------------------------------------------------------------
	//! Formats date components into a padded date string (e.g. 5, 9, 2026 -> "05.09.2026")
	static string FormatDate(int iDay, int iMonth, int iYear, string sSeparator = ".")
	{
		string sDayFormatted = BPR_FormatNumber.FormatLeadingZeroes(iDay, 2);
		string sMonthFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMonth, 2);
		string sYearFormatted = BPR_FormatNumber.FormatLeadingZeroes(iYear, 4);

		return string.Format("%1%2%3%4%5", sDayFormatted, sSeparator, sMonthFormatted, sSeparator, sYearFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats time components into a padded time string (e.g. 14, 5, 9 -> "14:05:09" or 14, 5, -1 -> "14:05")
	static string FormatTime(int iHour, int iMinute, int iSecond = -1, string sSeparator = ":")
	{
		string sHourFormatted = BPR_FormatNumber.FormatLeadingZeroes(iHour, 2);
		string sMinuteFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMinute, 2);

		if (iSecond >= 0)
		{
			string sSecondFormatted = BPR_FormatNumber.FormatLeadingZeroes(iSecond, 2);
			return string.Format("%1%2%3%4%5", sHourFormatted, sSeparator, sMinuteFormatted, sSeparator, sSecondFormatted);
		}

		return string.Format("%1%2%3", sHourFormatted, sSeparator, sMinuteFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats date and time into a combined timestamp string (e.g. "05.09.2026 14:05:00")
	static string FormatDateTime(int iDay, int iMonth, int iYear, int iHour, int iMinute, int iSecond = -1)
	{
		string sDate = FormatDate(iDay, iMonth, iYear);
		string sTime = FormatTime(iHour, iMinute, iSecond);

		return string.Format("%1 %2", sDate, sTime);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats a duration in seconds into MM:SS or HH:MM:SS (e.g. 125 -> "02:05", 3665 -> "01:01:05")
	static string FormatDuration(int iTotalSeconds, bool bIncludeHours = false)
	{
		if (iTotalSeconds < 0)
			iTotalSeconds = 0;

		int iHours = iTotalSeconds / 3600;
		int iMinutes = (iTotalSeconds % 3600) / 60;
		int iSeconds = iTotalSeconds % 60;

		if (bIncludeHours || iHours > 0)
		{
			return FormatTime(iHours, iMinutes, iSeconds);
		}

		string sMinuteFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMinutes, 2);
		string sSecondFormatted = BPR_FormatNumber.FormatLeadingZeroes(iSeconds, 2);
		return string.Format("%1:%2", sMinuteFormatted, sSecondFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Parses and validates a date string (dd.mm.yyyy, dd-mm-yyyy or dd/mm/yyyy).
	//! Checks for valid year range, month range, and days per month including leap years.
	//! Returns true if valid, and outputs iDay, iMonth, iYear.
	static bool ParseDate(string sDateString, out int iDay, out int iMonth, out int iYear)
	{
		iDay = 0;
		iMonth = 0;
		iYear = 0;

		if (sDateString == "")
			return false;

		// Detect separator (. or - or /)
		string sSeparator = "";
		if (sDateString.IndexOf(".") != -1)
			sSeparator = ".";
		else if (sDateString.IndexOf("-") != -1)
			sSeparator = "-";
		else if (sDateString.IndexOf("/") != -1)
			sSeparator = "/";
		else
			return false;

		int iFirstSeparator = sDateString.IndexOf(sSeparator);
		if (iFirstSeparator == -1)
			return false;

		string sRemainingDate = sDateString.Substring(iFirstSeparator + 1, sDateString.Length() - (iFirstSeparator + 1));
		int iSecondSeparatorInRemaining = sRemainingDate.IndexOf(sSeparator);
		if (iSecondSeparatorInRemaining == -1)
			return false;

		string sDayPart = sDateString.Substring(0, iFirstSeparator);
		string sMonthPart = sRemainingDate.Substring(0, iSecondSeparatorInRemaining);
		string sYearPart = sRemainingDate.Substring(iSecondSeparatorInRemaining + 1, sRemainingDate.Length() - (iSecondSeparatorInRemaining + 1));

		int iParsedDay = sDayPart.ToInt();
		int iParsedMonth = sMonthPart.ToInt();
		int iParsedYear = sYearPart.ToInt();

		// Validate year range
		if (iParsedYear < MIN_VALID_YEAR || iParsedYear > MAX_VALID_YEAR)
			return false;

		// Validate month range
		if (iParsedMonth < 1 || iParsedMonth > 12)
			return false;

		// Validate days in month (including leap year)
		int iMaxDays = GetDaysInMonth(iParsedMonth, iParsedYear);
		if (iParsedDay < 1 || iParsedDay > iMaxDays)
			return false;

		iDay = iParsedDay;
		iMonth = iParsedMonth;
		iYear = iParsedYear;
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Parses and validates a time string (HH:MM or HH:MM:SS).
	//! Checks for valid hour (0-23), minute (0-59), and second (0-59).
	//! Returns true if valid, and outputs iHour, iMinute, iSecond.
	static bool ParseTime(string sTimeString, out int iHour, out int iMinute, out int iSecond)
	{
		iHour = 0;
		iMinute = 0;
		iSecond = 0;

		if (sTimeString == "")
			return false;

		int iFirstColon = sTimeString.IndexOf(":");
		if (iFirstColon == -1)
			return false;

		string sHourPart = sTimeString.Substring(0, iFirstColon);
		string sRemainingTime = sTimeString.Substring(iFirstColon + 1, sTimeString.Length() - (iFirstColon + 1));
		int iSecondColonInRemaining = sRemainingTime.IndexOf(":");

		string sMinutePart = "";
		string sSecondPart = "0";

		if (iSecondColonInRemaining != -1)
		{
			sMinutePart = sRemainingTime.Substring(0, iSecondColonInRemaining);
			sSecondPart = sRemainingTime.Substring(iSecondColonInRemaining + 1, sRemainingTime.Length() - (iSecondColonInRemaining + 1));
		}
		else
		{
			sMinutePart = sRemainingTime;
		}

		int iParsedHour = sHourPart.ToInt();
		int iParsedMinute = sMinutePart.ToInt();
		int iParsedSecond = sSecondPart.ToInt();

		if (iParsedHour < 0 || iParsedHour > 23)
			return false;

		if (iParsedMinute < 0 || iParsedMinute > 59)
			return false;

		if (iParsedSecond < 0 || iParsedSecond > 59)
			return false;

		iHour = iParsedHour;
		iMinute = iParsedMinute;
		iSecond = iParsedSecond;
		return true;
	}
};
`
  },
  {
    id: 'util_global_formatnumber',
    name: 'BPR_FormatNumber.c',
    path: 'Utilities/Global/BPR_FormatNumber.c',
    folder: 'Utilities/Global',
    status: 'new',
    description: 'Global utility class for formatting numbers (int and float) with leading zeroes, thousand separators, and rounding.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_FormatNumber.c
// Author: Indy & AI Assistant
// Description: Global utility class for formatting numbers (int and float).
//              Provides decimals rounding, leading zeroes, thousand grouping,
//              custom decimal separators, and sign control.
// ============================================================================

class BPR_FormatNumber
{
	const static string CALLER_ID = "FmtNum";

	//------------------------------------------------------------------------------------------------
	//! Formats an integer with leading zeroes, thousand grouping, and optional sign
	//! Example: FormatInt(1500000, 1, true, ".") -> "1.500.000"
	//! Example: FormatInt(5, 3) -> "005"
	static string FormatInt(int iValue, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", bool bForceSign = false)
	{
		bool bIsNegative = (iValue < 0);
		int iAbsValue = Math.AbsInt(iValue);
		string sDigits = iAbsValue.ToString();

		// Add leading zeroes if required
		while (sDigits.Length() < iMinDigits)
		{
			sDigits = "0" + sDigits;
		}

		// Insert grouping separators in 3-digit blocks
		string sResult = "";
		if (bUseGrouping && sGroupingSeparator != "")
		{
			int iLen = sDigits.Length();
			int iRemainder = iLen % 3;
			if (iRemainder == 0)
				iRemainder = 3;

			sResult = sDigits.Substring(0, iRemainder);
			for (int iIdx = iRemainder; iIdx < iLen; iIdx += 3)
			{
				sResult = sResult + sGroupingSeparator + sDigits.Substring(iIdx, 3);
			}
		}
		else
		{
			sResult = sDigits;
		}

		// Apply sign
		if (bIsNegative)
			sResult = "-" + sResult;
		else if (bForceSign && iValue > 0)
			sResult = "+" + sResult;

		return sResult;
	}

	//------------------------------------------------------------------------------------------------
	//! Formats a float with decimals, leading zeroes, thousand grouping, and customizable separators
	//! Example: FormatFloat(12345.678, 2, 1, true, ".", ",") -> "12.345,68"
	//! Example: FormatFloat(-0.5, 2, 1, false, "", ",", false) -> "-0,50"
	static string FormatFloat(float fValue, int iDecimals = 2, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", string sDecimalSeparator = ",", bool bForceSign = false)
	{
		bool bIsNegative = (fValue < 0.0);
		float fAbsValue = Math.AbsFloat(fValue);

		// If no decimal places are requested, round directly to integer
		if (iDecimals <= 0)
		{
			int iRoundedInt = Math.Round(fAbsValue);
			if (bIsNegative)
				iRoundedInt = -iRoundedInt;

			return FormatInt(iRoundedInt, iMinDigits, bUseGrouping, sGroupingSeparator, bForceSign);
		}

		// Calculate rounding precision factor
		float fFactor = Math.Pow(10, iDecimals);
		float fRounded = Math.Round(fAbsValue * fFactor) / fFactor;

		int iIntegerPart = Math.Floor(fRounded);
		int iFractionPart = Math.Round((fRounded - iIntegerPart) * fFactor);

		// Handle overflow when rounding up (e.g. 0.999 -> 1.00)
		if (iFractionPart >= fFactor)
		{
			iIntegerPart++;
			iFractionPart = 0;
		}

		// Format integer portion without sign (sign is applied to final result)
		string sFormattedInteger = FormatInt(iIntegerPart, iMinDigits, bUseGrouping, sGroupingSeparator, false);

		// Format fraction portion with exact decimal padding
		string sFractionString = iFractionPart.ToString();
		while (sFractionString.Length() < iDecimals)
		{
			sFractionString = "0" + sFractionString;
		}

		string sResult = sFormattedInteger + sDecimalSeparator + sFractionString;

		// Apply sign
		if (bIsNegative)
			sResult = "-" + sResult;
		else if (bForceSign && fValue > 0.0)
			sResult = "+" + sResult;

		return sResult;
	}

	//------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------
	//! Convenient overload: Format integer
	static string Format(int iValue, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", bool bForceSign = false)
	{
		return FormatInt(iValue, iMinDigits, bUseGrouping, sGroupingSeparator, bForceSign);
	}

	//------------------------------------------------------------------------------------------------
	//! Convenient overload: Format float
	static string Format(float fValue, int iDecimals = 2, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", string sDecimalSeparator = ",", bool bForceSign = false)
	{
		return FormatFloat(fValue, iDecimals, iMinDigits, bUseGrouping, sGroupingSeparator, sDecimalSeparator, bForceSign);
	}

	//------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats an integer with thousand separators (e.g. 1500000 -> "1.500.000")
	static string FormatThousands(int iValue, string sSeparator = ".")
	{
		return FormatInt(iValue, 1, true, sSeparator, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats a float with thousand separators and decimals (e.g. 15000.5 -> "15.000,50")
	static string FormatThousands(float fValue, int iDecimals = 2, string sGroupingSeparator = ".", string sDecimalSeparator = ",")
	{
		return FormatFloat(fValue, iDecimals, 1, true, sGroupingSeparator, sDecimalSeparator, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats an integer with leading zeroes (e.g. 5, 2 -> "05" or 7, 3 -> "007")
	static string FormatLeadingZeroes(int iValue, int iDigits)
	{
		return FormatInt(iValue, iDigits, false, "", false);
	}
};
`
  },
  {
    id: 'util_global_maputility',
    name: 'BPR_MapUtility.c',
    path: 'Utilities/Global/BPR_MapUtility.c',
    folder: 'Utilities/Global',
    status: 'new',
    description: 'Universal server utility class for geographic coordinates parsing, validation, map identification, and tiered cascading fallbacks.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_MapUtility.c
// Author: Indy & AI Assistant
// Description: Universal server utility class for geographic coordinates.
//              Provides coordinate parsing, validation, base map identification,
//              and a flexible tiered cascade where callers can enter at any level:
//                Level 1: GetUserCoordinates (UserInput -> MapCoordinates)
//                Level 2: GetOverrideCoordinates / GetMapCoordinates (Override -> Original -> Fallback)
//                Level 3: GetOriginalCoordinates (Terrain -> Fallback)
//                Level 4: GetFallbackCoordinates (Guaranteed Base Fallback)
//              Also offers raw TryGet methods for presence checks without fallbacks.
// ============================================================================

class BPR_MapUtility
{
	const static string CALLER_ID = "MapUtil";

	// Ultimate fallback coordinates: Bohemia Interactive HQ in Prague
	const static float DEFAULT_FALLBACK_LAT = 50.0755;
	const static float DEFAULT_FALLBACK_LON = 14.4378;
	const static string DEFAULT_FALLBACK_NAME = "Bohemia HQ (Prague)";

	//------------------------------------------------------------------------------------------------
	//! Determines the original base map name from SCR_MapEntity prefab resource (e.g. "Eden", "Arland").
	//! Strips custom subscene or mission world filenames to reliably identify the underlying terrain.
	static bool GetMapName(out string sMapName)
	{
		sMapName = "";

		SCR_MapEntity pMapEntity = SCR_MapEntity.GetMapInstance();
		if (!pMapEntity)
			return false;

		EntityPrefabData pPrefabData = pMapEntity.GetPrefabData();
		if (!pPrefabData)
			return false;

		ResourceName sPrefabResource = pPrefabData.GetPrefabName();
		if (sPrefabResource == "")
			return false;

		string sCleanName = FilePath.StripPath(sPrefabResource);
		sCleanName = FilePath.StripExtension(sCleanName);

		// Strip optional "MapEntity_" prefix
		if (sCleanName.IndexOf("MapEntity_") == 0)
			sCleanName = sCleanName.Substring(10, sCleanName.Length() - 10);

		if (sCleanName == "" || sCleanName == "Default" || sCleanName == "MapEntity")
			return false;

		sMapName = sCleanName;
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Parses and validates a coordinate string (e.g. "37.745, -25.699" or "50.0755; 14.4378").
	//! Supports variable decimal precision, negative values, and trims whitespace.
	//! Returns true if valid (-90 <= Lat <= 90 and -180 <= Lon <= 180).
	static bool ParseCoordinates(string sCoordString, out float fLat, out float fLon)
	{
		fLat = 0.0;
		fLon = 0.0;

		if (sCoordString == "")
			return false;

		// Detect separator (, or ;)
		int iSeparator = sCoordString.IndexOf(",");
		if (iSeparator == -1)
			iSeparator = sCoordString.IndexOf(";");

		if (iSeparator == -1)
			return false;

		string sLatPart = sCoordString.Substring(0, iSeparator);
		string sLonPart = sCoordString.Substring(iSeparator + 1, sCoordString.Length() - (iSeparator + 1));

		sLatPart.TrimInPlace();
		sLonPart.TrimInPlace();

		if (sLatPart == "" || sLonPart == "")
			return false;

		float fParsedLat = sLatPart.ToFloat();
		float fParsedLon = sLonPart.ToFloat();

		// Validate geographic ranges
		if (fParsedLat < -90.0 || fParsedLat > 90.0)
			return false;

		if (fParsedLon < -180.0 || fParsedLon > 180.0)
			return false;

		fLat = fParsedLat;
		fLon = fParsedLon;
		return true;
	}

	// ===============================================================================================
	// RAW GETTERS (No Fallbacks - Pure presence checks)
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Raw check: Strictly checks BPR_VariablesConfig.OVERRIDE_COORDS without any fallback.
	//! Returns true if configured and valid, false otherwise.
	static bool TryGetOverrideCoordinates(out float fLat, out float fLon, out string sSource)
	{
		fLat = 0.0;
		fLon = 0.0;
		sSource = "";

		if (BPR_VariablesConfig.OVERRIDE_COORDS == "")
			return false;

		if (!ParseCoordinates(BPR_VariablesConfig.OVERRIDE_COORDS, fLat, fLon))
		{
			DebugLog.Warn(CALLER_ID, string.Format("BPR_VariablesConfig.OVERRIDE_COORDS '%1' is invalid!", BPR_VariablesConfig.OVERRIDE_COORDS));
			return false;
		}

		string sLocationName = BPR_VariablesConfig.OVERRIDE_LOCATION;
		if (sLocationName == "")
			sLocationName = "ConfigOverride";

		sSource = string.Format("ConfigOverride (%1)", sLocationName);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Raw check: Strictly reads terrain coordinates from TimeAndWeatherManagerEntity without fallback.
	//! Returns true if successfully retrieved and within valid ranges, false otherwise.
	static bool TryGetOriginalCoordinates(out float fLat, out float fLon, out string sSource)
	{
		fLat = 0.0;
		fLon = 0.0;
		sSource = "";

		TimeAndWeatherManagerEntity pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);
		if (!pTimeManager)
			return false;

		float fEngineLat = pTimeManager.GetCurrentLatitude();
		float fEngineLon = pTimeManager.GetCurrentLongitude();

		// Validate geographic range
		if (fEngineLat < -90.0 || fEngineLat > 90.0 || fEngineLon < -180.0 || fEngineLon > 180.0)
			return false;

		fLat = fEngineLat;
		fLon = fEngineLon;

		string sMapName;
		if (GetMapName(sMapName))
			sSource = string.Format("MapOriginal (%1)", sMapName);
		else
			sSource = "MapOriginal";

		return true;
	}

	// ===============================================================================================
	// CASCADING GETTERS (With hierarchical fallbacks - Enter at any level)
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Level 4 (Base Fallback): Unconditionally returns Bohemia Interactive HQ in Prague.
	static void GetFallbackCoordinates(out float fLat, out float fLon, out string sSource)
	{
		fLat = DEFAULT_FALLBACK_LAT;
		fLon = DEFAULT_FALLBACK_LON;
		sSource = DEFAULT_FALLBACK_NAME;
	}

	//------------------------------------------------------------------------------------------------
	//! Level 3 Entry: Resolves original terrain coordinates.
	//! If terrain coordinates cannot be read from the engine, falls back to Prague HQ.
	//! Ideal for astronomical sun calculations, timezone logic, or base terrain queries.
	static bool GetOriginalCoordinates(out float fLat, out float fLon, out string sSource)
	{
		if (TryGetOriginalCoordinates(fLat, fLon, sSource))
			return true;

		DebugLog.Info(CALLER_ID, "Original terrain coordinates unavailable. Falling back to Prague HQ.");
		GetFallbackCoordinates(fLat, fLon, sSource);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Level 2 Entry: Resolves coordinates configured for the mission/map.
	//! Order of precedence:
	//!   1. BPR_VariablesConfig.OVERRIDE_COORDS
	//!   2. Original terrain coordinates (GetOriginalCoordinates)
	//!   3. Fallback (via GetOriginalCoordinates fallback)
	static bool GetOverrideCoordinates(out float fLat, out float fLon, out string sSource)
	{
		if (TryGetOverrideCoordinates(fLat, fLon, sSource))
			return true;

		return GetOriginalCoordinates(fLat, fLon, sSource);
	}

	//------------------------------------------------------------------------------------------------
	//! Convenient alias for GetOverrideCoordinates (starts the map-level cascade).
	static bool GetMapCoordinates(out float fLat, out float fLon, out string sSource)
	{
		return GetOverrideCoordinates(fLat, fLon, sSource);
	}

	//------------------------------------------------------------------------------------------------
	//! Level 1 Entry: Resolves coordinates starting from optional user input.
	//! Order of precedence:
	//!   1. Valid sUserCoords (e.g. from dialog/UI)
	//!   2. MapCoordinates (Override -> Original -> Fallback)
	static bool GetUserCoordinates(string sUserCoords, out float fLat, out float fLon, out string sSource)
	{
		if (sUserCoords != "")
		{
			if (ParseCoordinates(sUserCoords, fLat, fLon))
			{
				sSource = "UserInput";
				return true;
			}

			DebugLog.Warn(CALLER_ID, string.Format("Invalid user coordinates: '%1'. Falling back to map coordinates.", sUserCoords));
		}

		return GetMapCoordinates(fLat, fLon, sSource);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats coordinates into a standardized string (e.g. "37.7450, -25.6990")
	static string FormatCoordinates(float fLat, float fLon, int iDecimals = 4)
	{
		string sLatFormatted = BPR_FormatNumber.FormatFloat(fLat, iDecimals, 1, false, "", ".", false);
		string sLonFormatted = BPR_FormatNumber.FormatFloat(fLon, iDecimals, 1, false, "", ".", false);

		return string.Format("%1, %2", sLatFormatted, sLonFormatted);
	}
};
`
  },
  {
    id: 'util_global_time_weather',
    name: 'BPR_TimeAndWeatherManagerEntity.c',
    path: 'Utilities/Global/BPR_TimeAndWeatherManagerEntity.c',
    folder: 'Utilities/Global',
    status: 'new',
    description: 'Helper class to safely retrieve TimeAndWeatherManagerEntity via ChimeraWorld.CastFrom(baseWorld).',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_TimeAndWeatherManagerEntity.c
// Author: Indy & AI Assistant
// Description: Central helper class to retrieve TimeAndWeatherManagerEntity
//              via ChimeraWorld.CastFrom(baseWorld).
//
// USAGE:
// ----------------------------------------------------------------------------
// m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
// m_pTimeMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
// ============================================================================

class BPR_TimeAndWeatherManagerEntity
{
	const static string CALLER_ID = "TiWeMag";

	//------------------------------------------------------------------------------------------------
	//! Static method to obtain the TimeAndWeatherManagerEntity safely from the game world
	static TimeAndWeatherManagerEntity GetTimeAndWeatherManager(string sCaller = "", bool bSilent = false)
	{
		if (sCaller == "")
			sCaller = CALLER_ID;

		ArmaReforgerScripted pGame = GetGame();
		if (!pGame)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: Game instance could not be determined!");
			return null;
		}

		BaseWorld pBaseWorld = pGame.GetWorld();
		if (!pBaseWorld)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: Base world could not be determined!");
			return null;
		}

		// Conversion into ChimeraWorld interface required for simulation (CastFrom)
		ChimeraWorld pChimeraWorld = ChimeraWorld.CastFrom(pBaseWorld);
		if (!pChimeraWorld)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: World is not a valid ChimeraWorld!");
			return null;
		}

		// Retrieve TimeAndWeatherManager
		TimeAndWeatherManagerEntity pTimeAndWeatherManager = pChimeraWorld.GetTimeAndWeatherManager();
		if (pTimeAndWeatherManager)
		{
			DebugLog.Info(sCaller, "TimeAndWeatherManager successfully retrieved.");
			return pTimeAndWeatherManager;
		}

		if (!bSilent)
			DebugLog.Err(sCaller, "TimeAndWeatherManager not found on the map!");

		return null;
	}
};
`
  },
  {
    id: 'util_global_datetimescheduler',
    name: 'BPR_DateTimeScheduler.c',
    path: 'Utilities/Global/BPR_DateTimeScheduler.c',
    folder: 'Utilities/Global',
    status: 'new',
    description: 'Central date and time scheduler utility. Checks every 5 seconds for in-game day transitions and triggers the central OnDayChanged ScriptInvoker.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
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
`
  },
  {
    id: 'util_global_sunutility',
    name: 'BPR_SunUtility.c',
    path: 'Utilities/Global/BPR_SunUtility.c',
    folder: 'Utilities/Global',
    status: 'modified',
    description: 'Solar calculations utility (sunrise, sunset, solar noon, civil dawn/dusk, day length, sun progress) using terrain coordinates, O(1) getters, and bound to BPR_DateTimeScheduler.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
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
`
  },

  // --- Utilities/Client ---
  {
    id: 'util_client_audio',
    name: 'BPR_AudioUtility.c',
    path: 'Utilities/Client/BPR_AudioUtility.c',
    folder: 'Utilities/Client',
    status: 'new',
    description: 'Client-side audio utility class for 2D, 3D, and entity-based sound playback and sound event broadcasting.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_AudioUtility.c
// Author: Indy & AI Assistant
// Description: Global audio utility class for 2D, 3D and Entity-based sound playback
//              in Enfusion Engine. Provides network broadcast for shared sound events.
// ============================================================================

class BPR_AudioUtility
{
	const static string CALLER_ID = "AudUtil";

	//------------------------------------------------------------------------------------------------
	//! Plays a 2D sound locally on the client (UI, radio, tinnitus, inventory)
	static bool PlaySound2D(string sSoundEvent)
	{
		if (sSoundEvent == "")
			return false;

		AudioSystem.PlaySound(sSoundEvent);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Plays a 3D sound at a fixed world position (e.g. ambient dog barking in distance)
	static bool PlaySoudAtPosition(string sSoundEvent, vector vPosition)
	{
		if (sSoundEvent == "")
			return false;

		AudioHandle pSoundHandle = AudioSystem.PlaySound(sSoundEvent);
		if (!pSoundHandle)
			return false;

		vector vMat[4];
		Math3D.MatrixIdentity4(vMat);
		vMat[3] = vPosition;
		AudioSystem.SetSoundTransformation(pSoundHandle, vMat);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Plays a 3D sound attached to an entity (e.g. coughing player, vehicle horn)
	static bool PlaySoundOnEntity(string sSoundEvent, IEntity pEntity)
	{
		if (!pEntity || sSoundEvent == "")
			return false;

		// If the entity has a SoundComponent, trigger the sound event through it
		SoundComponent pSoundComp = SoundComponent.Cast(pEntity.FindComponent(SoundComponent));
		if (pSoundComp)
		{
			pSoundComp.SoundEvent(sSoundEvent);
			return true;
		}

		// Fallback to playing 3D sound at current entity origin
		return PlaySoudAtPosition(sSoundEvent, pEntity.GetOrigin());
	}

	//------------------------------------------------------------------------------------------------
	//! Sends a network broadcast so all clients in the session play the sound for a player entity
	//! (e.g. coughing or shouts that nearby players should hear)
	static void BroadcastPlayerSound(int iPlayerId, string sSoundEvent)
	{
		BPR_NetworkManagerComponent pNetworkMgr = BPR_NetworkManagerComponent.GetInstance();
		if (!pNetworkMgr)
		{
			DebugLog.Err(CALLER_ID, "BroadcastPlayerSound failed: NetworkManager not found!");
			return;
		}

		// Payload formatted as "PlayerId:SoundEvent"
		string sPayload = string.Format("%1:%2", iPlayerId, sSoundEvent);
		pNetworkMgr.BroadcastMessage(BPR_ENetworkMessageType.SOUND_TRIGGER, sPayload, iPlayerId);
	}
};
`
  },

  // --- Utilities/Server ---
  {
    id: 'util_server_json_config_handler',
    name: 'BPR_JsonConfigHandler.c',
    path: 'Utilities/Server/BPR_JsonConfigHandler.c',
    folder: 'Utilities/Server',
    status: 'new',
    description: 'Server-side JSON configuration handler. Verifies existence, integrity, and version of BPR_ServerConfig.json, creates backups and error dumps, and provides static access via BPR_JsonConfigHandler.GetConfig().',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_JsonConfigHandler.c
// Author: Indy & AI Assistant
// Description: Server-side JSON configuration handler. Verifies existence,
//              integrity, and version of BPR_ServerConfig.json.
//              Creates BPR_ServerConfigError.json on file corruption
//              and BPR_ServerConfig_Backup.json on version updates.
//              Provides access via BPR_JsonConfigHandler.GetConfig().
//              Supports updating active memory (SetConfig) without file writes,
//              as well as explicitly saving to disk (SaveActiveConfigToFile).
//              Provides serialization for network payload transfer.
//
// HOW TO ACCESS CONFIG VARIABLES IN OTHER SCRIPTS:
// ----------------------------------------------------------------------------
// BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
// if (pConfig)
// {
//     int iTimeMode = pConfig.iTimeMode;
//     int iWeatherMode = pConfig.iWeatherMode;
//     string sDate = pConfig.sStartDate;
// }
// ============================================================================

class BPR_JsonConfigHandler
{
	const static string CALLER_ID = "CfgHandl";
	
	const static string CONFIG_FILE_PATH = BPR_VariablesConfig.CONFIG_DIR + "BPR_ServerConfig.json";
	const static string BACKUP_FILE_PATH = BPR_VariablesConfig.CONFIG_DIR + "BPR_ServerConfig_Backup.json";
	const static string ERROR_FILE_PATH  = BPR_VariablesConfig.CONFIG_DIR + "BPR_ServerConfig_Error.json";

	protected static ref BPR_ServerConfig s_pServerConfig;
	protected static string s_sStatusNotice = "";

	//------------------------------------------------------------------------------------------------
	//! Returns a potential status message (e.g., backup created or error occurred).
	static string GetStatusNotice()
	{
		return s_sStatusNotice;
	}

	//------------------------------------------------------------------------------------------------
	//! Initializes the configuration: verifies file existence, readability, version, and creates backups if needed
	static void InitConfig()
	{
		s_sStatusNotice = "";

		// Check if configuration directory exists
		if (!FileIO.FileExists(BPR_VariablesConfig.CONFIG_DIR))
		{
		    FileIO.MakeDirectory(BPR_VariablesConfig.CONFIG_DIR);
			DebugLog.Info(CALLER_ID, string.Format("Subfolder for server config created."));
		}		
		
		// Check if configuration file exists
		if (!FileIO.FileExists(CONFIG_FILE_PATH))
		{
			ref BPR_ServerConfig freshConfig = new BPR_ServerConfig();
			freshConfig.SaveToFile(CONFIG_FILE_PATH);
			s_pServerConfig = freshConfig;

			LoadingLog();
			return;
		}

		// File exists -> Verify readability and load JSON
		ref BPR_ServerConfig loadedConfig = new BPR_ServerConfig();
		bool bLoaded = loadedConfig.LoadFromFile(CONFIG_FILE_PATH);

		if (!bLoaded)
		{
			s_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_ERR_JsonLoad";
			DebugLog.Warn(CALLER_ID, "Config file is invalid or corrupted. Creating error backup (BPR_ServerConfig_Error.json) and generating defaults...");
			FileIO.CopyFile(CONFIG_FILE_PATH, ERROR_FILE_PATH);

			ref BPR_ServerConfig replacementConfig = new BPR_ServerConfig();
			replacementConfig.SaveToFile(CONFIG_FILE_PATH);
			s_pServerConfig = replacementConfig;

			LoadingLog();
			return;
		}

		// Verify version match
		ref BPR_ServerConfig referenceConfig = new BPR_ServerConfig();
		string sExpectedVersion = referenceConfig.sVersion;

		if (loadedConfig.sVersion != sExpectedVersion)
		{
			s_sStatusNotice = string.Format("#BPR-ParameterSetupDialog_Msg_WAR_BckJsonLoad", loadedConfig.sVersion, sExpectedVersion);
			DebugLog.Warn(CALLER_ID, string.Format("Config version mismatch (found: v%1, expected: v%2). Creating backup (BPR_ServerConfig_Backup.json) and updating...", loadedConfig.sVersion, sExpectedVersion));
			FileIO.CopyFile(CONFIG_FILE_PATH, BACKUP_FILE_PATH);

			referenceConfig.SaveToFile(CONFIG_FILE_PATH);
			s_pServerConfig = referenceConfig;

			LoadingLog();
			return;
		}

		// Configuration valid and up to date
		s_pServerConfig = loadedConfig;
		LoadingLog();
	}

	//------------------------------------------------------------------------------------------------
	//! Packs status notice, server config and Open-Meteo availability into a serialized network string
	static string PackConfigPayload()
	{
		if (!s_pServerConfig)
			InitConfig();

		string sJoinedParams = "";
		if (s_pServerConfig)
		{
			ref array<string> aParams = s_pServerConfig.ToParamArray();
			for (int i = 0; i < aParams.Count(); i++)
			{
				if (i > 0)
					sJoinedParams += ";";
				sJoinedParams += aParams[i];
			}
		}

		int iOmStatus = BPR_FetchOpenMeteoData.GetStatus();
		string sOmDiagnostic = BPR_FetchOpenMeteoData.GetDiagnosticNotice();

		return s_sStatusNotice + "§" + sJoinedParams + "§" + iOmStatus.ToString() + "§" + sOmDiagnostic;
	}

	//------------------------------------------------------------------------------------------------
	//! Unpacks network payload string into ServerConfig object, status notice, and Open-Meteo availability
	static bool UnpackConfigPayload(string sPayload, out BPR_ServerConfig pOutConfig, out string sOutNotice, out BPR_EOpenMeteoStatus eOutOmStatus, out string sOutOmDiagnostic)
	{
		sOutNotice = "";
		pOutConfig = null;
		eOutOmStatus = BPR_EOpenMeteoStatus.UNKNOWN;
		sOutOmDiagnostic = "";

		ref array<string> aSections = new array<string>();
		sPayload.Split("§", aSections, false);

		string sJoinedParams = "";
		if (aSections.Count() > 0)
			sOutNotice = aSections[0];

		if (aSections.Count() > 1)
			sJoinedParams = aSections[1];

		if (aSections.Count() > 2)
			eOutOmStatus = aSections[2].ToInt();

		if (aSections.Count() > 3)
			sOutOmDiagnostic = aSections[3];

		ref array<string> aParams = new array<string>();
		sJoinedParams.Split(";", aParams, false);

		pOutConfig = new BPR_ServerConfig();
		pOutConfig.FromParamArray(aParams);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Backwards-compatible overload for unpack
	static bool UnpackConfigPayload(string sPayload, out BPR_ServerConfig pOutConfig, out string sOutNotice)
	{
		BPR_EOpenMeteoStatus eDummyStatus;
		string sDummyDiagnostic;
		return UnpackConfigPayload(sPayload, pOutConfig, sOutNotice, eDummyStatus, sDummyDiagnostic);
	}

	//------------------------------------------------------------------------------------------------
	//! Debug log for successfully loaded JSON
	static void LoadingLog()
	{
		if (s_pServerConfig)
			DebugLog.Info(CALLER_ID, string.Format("Configuration loaded successfully (v%1).", s_pServerConfig.sVersion));
	}
	
	//------------------------------------------------------------------------------------------------
	//! Static access method to retrieve loaded configuration parameters
	static BPR_ServerConfig GetConfig()
	{
		return s_pServerConfig;
	}

	//------------------------------------------------------------------------------------------------
	//! Updates the in-memory active server configuration (RAM only, without touching the JSON file on disk)
	static void SetConfig(BPR_ServerConfig pNewConfig)
	{
		s_pServerConfig = pNewConfig;
		if (pNewConfig)
			DebugLog.Info(CALLER_ID, string.Format("Active server configuration updated in RAM. StartDate=%1, TimeMode=%2, WeatherMode=%3", pNewConfig.sStartDate, pNewConfig.iTimeMode, pNewConfig.iWeatherMode));
	}

	//------------------------------------------------------------------------------------------------
	//! Saves the active in-memory server configuration to the JSON file on disk
	static bool SaveActiveConfigToFile()
	{
		if (!s_pServerConfig)
			return false;

		bool bSaved = s_pServerConfig.SaveToFile(CONFIG_FILE_PATH);
		DebugLog.Info(CALLER_ID, string.Format("Active server configuration written to file '%1': %2", CONFIG_FILE_PATH, bSaved));
		return bSaved;
	}
};
`
  },

  // --- Client/UI ---
  {
    id: 'client_ui_loading_dialog',
    name: 'BPR_ClientLoadingDialog.c',
    path: 'Client/UI/BPR_ClientLoadingDialog.c',
    folder: 'Client/UI',
    status: 'new',
    description: 'Client loading dialog displayed to players while mission loading is in progress. Controlled by BPR_MissionLoadingManager.',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClientLoadingDialog.c
// Author: Indy & AI Assistant
// Description: Client loading dialog displayed to players while mission loading
//              is in progress. Controlled by BPR_MissionLoadingManagerComponent.
// ============================================================================

modded enum ChimeraMenuPreset
{
	BPR_ClientLoadingDialog
};

class BPR_ClientLoadingDialog : ChimeraMenuBase
{
	const static string CALLER_ID = "LoadDlg";

	protected Widget m_wRoot;

	//------------------------------------------------------------------------------------------------
	//! Called when menu is opened
	override void OnMenuOpen()
	{
		super.OnMenuOpen();
		m_wRoot = GetRootWidget();
		DebugLog.Info(CALLER_ID, "Client loading dialog opened.");
	}

	//------------------------------------------------------------------------------------------------
	//! Called when menu is closed
	override void OnMenuClose()
	{
		super.OnMenuClose();
		DebugLog.Info(CALLER_ID, "Client loading dialog closed.");
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper to open this menu
	static BPR_ClientLoadingDialog OpenDialog()
	{
		MenuManager pMenuManager = GetGame().GetMenuManager();
		if (!pMenuManager)
			return null;

		return BPR_ClientLoadingDialog.Cast(pMenuManager.OpenMenu(ChimeraMenuPreset.BPR_ClientLoadingDialog));
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper to close this menu
	static void CloseDialog()
	{
		MenuManager pMenuManager = GetGame().GetMenuManager();
		if (!pMenuManager)
			return;

		pMenuManager.CloseMenuByPreset(ChimeraMenuPreset.BPR_ClientLoadingDialog);
	}
};
`
  },
    {
    id: 'client_ui_parametersetup_dialog',
    name: 'BPR_ParameterSetupDialog.c',
    path: 'Client/UI/BPR_ParameterSetupDialog.c',
    folder: 'Client/UI',
    status: 'modified',
    description: 'Parameter setup dialog supporting 0. Random for weather transitions and transition times.',
    createdAt: '2026-09-28',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ParameterSetupDialog.c
// Author: Indy & AI Assistant
// Description: Mission parameter setup dialog displayed to the first connected
//              admin to customize mission parameters prior to mission launch.
//              - Populates and sanitizes ComboBoxes and input fields from BPR_ServerConfig.
//              - Dynamically enables/disables and greys out dependent UI fields.
//              - Validates Date and Lat/Lon formats with fallback replacement.
//              - Evaluates Open-Meteo pre-flight status to restrict modes 3 & 4.
//              - Uses predefined status colors for Success, Warning, Error and Info.
//              - Buttons: Reset (revert to JSON), Save (write to JSON), Start (RAM only).
//              - AFK Timer: Auto-starts with fallback defaults on expiration.
//              - Mission Launch: Locks start button, displays launch status,
//                updates server RAM, and remains open during launch delay until
//                BPR_MissionLoadingManagerComponent triggers final release.
// ============================================================================

modded enum ChimeraMenuPreset
{
	BPR_ParameterSetupDialog
};

class BPR_ParameterSetupDialog : ChimeraMenuBase
{
	const static string CALLER_ID = "ParamDlg";

	// --- Predefined Status Colors (Strict Hungarian Notation) ---
	protected ref Color m_pColorSuccess;
	protected ref Color m_pColorWarning;
	protected ref Color m_pColorError;
	protected ref Color m_pColorInfo;

	// --- Root & Data ---
	protected Widget m_wRoot;
	protected ref BPR_ServerConfig m_pServerConfig;
	protected ref BPR_ServerConfig m_pOriginalConfig;
	protected string m_sStatusNotice = "";
	protected bool m_bOpenMeteoAvailable = false;
	protected BPR_EOpenMeteoStatus m_eOpenMeteoStatus = BPR_EOpenMeteoStatus.UNKNOWN;
	protected string m_sOpenMeteoNotice = "";

	// --- Date Panel Widgets ---
	protected XComboBoxWidget m_wComboDateMode;
	protected EditBoxWidget m_wInputDate;
	protected TextWidget m_wMsgBoxDate;
	protected TextWidget m_wLblStartDate;

	// --- Time Panel Widgets ---
	protected XComboBoxWidget m_wComboTimeMode;
	protected XComboBoxWidget m_wComboTimezoneUTC;
	protected CheckBoxWidget m_wCheckSummertime;
	protected XComboBoxWidget m_wComboCustomHour;
	protected TextWidget m_wLblTimezoneUTC;
	protected TextWidget m_wLblSummertime;
	protected TextWidget m_wLblCustomHour;

	// --- Weather Panel Widgets ---
	protected XComboBoxWidget m_wComboWeatherMode;
	protected XComboBoxWidget m_wComboStartWeather;
	protected XComboBoxWidget m_wComboWeatherTransition;
	protected XComboBoxWidget m_wComboTransitionTime;
	protected EditBoxWidget m_wInputLatLon;
	protected TextWidget m_wMsgBoxWeather;
	protected TextWidget m_wMsgBoxCoordinates;
	protected TextWidget m_wLblStartWeather;
	protected TextWidget m_wLblTransitions;
	protected TextWidget m_wLblTransitionTime;
	protected TextWidget m_wLblLatLon;

	// --- Ambient Panel Widgets ---
	protected XComboBoxWidget m_wComboAmbientFactor;
	protected TextWidget m_wLblAmbientFactor;

	// --- Admin & Status Widgets ---
	protected CheckBoxWidget m_wCheckDebugMode;
	protected CheckBoxWidget m_wCheckSetupTimer;
	protected TextWidget m_wMsgBoxInfo;
	protected TextWidget m_wDisplaySetupTimer;

	// --- Button Widgets ---
	protected ButtonWidget m_wButtonReset;
	protected ButtonWidget m_wButtonSave;
	protected ButtonWidget m_wButtonStart;

	// --- AFK Timer Variables ---
	protected float m_fTimerDuration = 30.0;
	protected float m_fTimerRemaining = 30.0;
	protected bool m_bTimerActive = false;

	//------------------------------------------------------------------------------------------------
	//! Constructor: Initializes predefined status colors
	void BPR_ParameterSetupDialog()
	{
		m_pColorSuccess = Color.FromRGBA(40, 159, 70, 255);    // Green (Success / OK)
		m_pColorWarning = Color.FromRGBA(226, 113, 8, 255);   // Orange (Warning / Fallback)
		m_pColorError   = Color.FromRGBA(159, 40, 40, 255);   // Red (Error / Deactivated)
		m_pColorInfo    = Color.FromRGBA(70, 130, 180, 255);  // Steel blue (Information)
	}

	//------------------------------------------------------------------------------------------------
	//! Called when menu is opened
	override void OnMenuOpen()
	{
		super.OnMenuOpen();
		m_wRoot = GetRootWidget();
		DebugLog.Info(CALLER_ID, "Parameter setup dialog opened.");

		FindAllWidgets();
		PopulateComboBoxes();
		FetchServerConfig();
	}

	//------------------------------------------------------------------------------------------------
	//! Called when menu is closed
	override void OnMenuClose()
	{
		super.OnMenuClose();

		GetGame().GetCallqueue().Remove(OnTimerTick);

		BPR_FetchOpenMeteoData pOmData = BPR_FetchOpenMeteoData.GetInstance();
		if (pOmData)
			pOmData.GetOnCheckFinished().Remove(OnOpenMeteoCheckFinished);

		BPR_PlayerNetworkComponent pNetComp = BPR_PlayerNetworkComponent.GetLocalPlayerNetworkComponent();
		if (pNetComp)
			pNetComp.GetOnClientResponseReceived().Remove(OnClientResponseReceived);

		DebugLog.Info(CALLER_ID, "Parameter setup dialog closed.");
	}

	//------------------------------------------------------------------------------------------------
	//! Resolves all widget references from the layout
	protected void FindAllWidgets()
	{
		if (!m_wRoot)
			return;

		// Date panel
		m_wComboDateMode = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboDateMode"));
		m_wInputDate = EditBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wInputDate"));
		m_wMsgBoxDate = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wMsgBoxDate"));
		m_wLblStartDate = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblStartDate"));

		// Time panel
		m_wComboTimeMode = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboTimeMode"));
		m_wComboTimezoneUTC = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboTimezoneUTC"));
		m_wCheckSummertime = CheckBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wCheckSummertime"));
		m_wComboCustomHour = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboCustomHour"));
		m_wLblTimezoneUTC = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblTimezoneUTC"));
		m_wLblSummertime = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblSummertime"));
		m_wLblCustomHour = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblCustomHour"));

		// Weather panel
		m_wComboWeatherMode = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboWeatherMode"));
		m_wComboStartWeather = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboStartWeather"));
		m_wComboWeatherTransition = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboWeatherTransition"));
		m_wComboTransitionTime = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboTransitionTime"));
		m_wInputLatLon = EditBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wInputLatLon"));
		m_wMsgBoxWeather = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wMsgBoxWeather"));
		m_wMsgBoxCoordinates = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wMsgBoxCoordinates"));
		m_wLblStartWeather = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblStartWeather"));
		m_wLblTransitions = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblTransitions"));
		m_wLblTransitionTime = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblTransitionTime"));
		m_wLblLatLon = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblLatLon"));

		// Ambient panel
		m_wComboAmbientFactor = XComboBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wComboAmbientFactor"));
		m_wLblAmbientFactor = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wLblAmbientFactor"));

		// Admin & Status
		m_wCheckDebugMode = CheckBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wCheckDebugMode"));
		m_wCheckSetupTimer = CheckBoxWidget.Cast(m_wRoot.FindAnyWidget("m_wCheckSetupTimer"));
		m_wMsgBoxInfo = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wMsgBoxInfo"));
		m_wDisplaySetupTimer = TextWidget.Cast(m_wRoot.FindAnyWidget("m_wDisplaySetupTimer"));

		// Buttons
		m_wButtonReset = ButtonWidget.Cast(m_wRoot.FindAnyWidget("m_wButtonReset"));
		m_wButtonSave = ButtonWidget.Cast(m_wRoot.FindAnyWidget("m_wButtonSave"));
		m_wButtonStart = ButtonWidget.Cast(m_wRoot.FindAnyWidget("m_wButtonStart"));

		// Initialize error/info labels as hidden
		if (m_wMsgBoxDate)
			m_wMsgBoxDate.SetVisible(false);

		if (m_wMsgBoxWeather)
			m_wMsgBoxWeather.SetVisible(false);

		if (m_wMsgBoxCoordinates)
			m_wMsgBoxCoordinates.SetVisible(false);

		if (m_wDisplaySetupTimer)
			m_wDisplaySetupTimer.SetVisible(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Populates all ComboBox widgets with their respective options
	protected void PopulateComboBoxes()
	{
		// Date Mode: 1. Mission date; 2. UTC date; 3. Free date
		if (m_wComboDateMode)
		{
			m_wComboDateMode.ClearAll();
			m_wComboDateMode.AddItem("#BPR-ParameterSetupDialog_Cmb_DateMode_01");
			m_wComboDateMode.AddItem("#BPR-ParameterSetupDialog_Cmb_DateMode_02");
			m_wComboDateMode.AddItem("#BPR-ParameterSetupDialog_Cmb_DateMode_03");
		}

		// Time Mode: 1. UTC time; 2. Choose hour of day; 3. Random hour; 4. Maptime
		if (m_wComboTimeMode)
		{
			m_wComboTimeMode.ClearAll();
			m_wComboTimeMode.AddItem("#BPR-ParameterSetupDialog_Cmb_TimeMode_01");
			m_wComboTimeMode.AddItem("#BPR-ParameterSetupDialog_Cmb_TimeMode_02");
			m_wComboTimeMode.AddItem("#BPR-ParameterSetupDialog_Cmb_TimeMode_03");
			m_wComboTimeMode.AddItem("#BPR-ParameterSetupDialog_Cmb_TimeMode_04");
		}

		// Timezone UTC: -12 to 14
		if (m_wComboTimezoneUTC)
		{
			m_wComboTimezoneUTC.ClearAll();
			for (int iZone = -12; iZone <= 14; iZone++)
			{
				string sSign = "+";
				if (iZone < 0)
					sSign = "";
				m_wComboTimezoneUTC.AddItem(string.Format("UTC %1%2", sSign, iZone));
			}
		}

		// Custom Hour: 00:00 to 23:00
		if (m_wComboCustomHour)
		{
			m_wComboCustomHour.ClearAll();
			for (int iHour = 0; iHour < 24; iHour++)
			{
				string sHourStr = iHour.ToString();
				if (iHour < 10)
					sHourStr = "0" + sHourStr;
				m_wComboCustomHour.AddItem(string.Format("%1:00", sHourStr));
			}
		}

		// StartWeather: 0. Random; 1. Clear; 2. Cloudy; 3. Overcast; 4. Rainy
		if (m_wComboStartWeather)
		{
			m_wComboStartWeather.ClearAll();
			m_wComboStartWeather.AddItem("#BPR-ParameterSetupDialog_Cmb_StartWeather_00");
			m_wComboStartWeather.AddItem("#BPR-ParameterSetupDialog_Cmb_StartWeather_01");
			m_wComboStartWeather.AddItem("#BPR-ParameterSetupDialog_Cmb_StartWeather_02");
			m_wComboStartWeather.AddItem("#BPR-ParameterSetupDialog_Cmb_StartWeather_03");
			m_wComboStartWeather.AddItem("#BPR-ParameterSetupDialog_Cmb_StartWeather_04");
		}

		// WeatherTransitions: 0. Random; 1. Never; 2. 60 min; 3. 30 min; 4. 10 min
		if (m_wComboWeatherTransition)
		{
			m_wComboWeatherTransition.ClearAll();
			m_wComboWeatherTransition.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherTransitions_00");
			m_wComboWeatherTransition.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherTransitions_01");
			m_wComboWeatherTransition.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherTransitions_02");
			m_wComboWeatherTransition.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherTransitions_03");
			m_wComboWeatherTransition.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherTransitions_04");
		}

		// TransitionTime: 0. Random; 1. 30 min; 2. 15 min; 3. 7.5 min; 4. 5 min
		if (m_wComboTransitionTime)
		{
			m_wComboTransitionTime.ClearAll();
			m_wComboTransitionTime.AddItem("#BPR-ParameterSetupDialog_Cmb_TransitionTime_00");
			m_wComboTransitionTime.AddItem("#BPR-ParameterSetupDialog_Cmb_TransitionTime_01");
			m_wComboTransitionTime.AddItem("#BPR-ParameterSetupDialog_Cmb_TransitionTime_02");
			m_wComboTransitionTime.AddItem("#BPR-ParameterSetupDialog_Cmb_TransitionTime_03");
			m_wComboTransitionTime.AddItem("#BPR-ParameterSetupDialog_Cmb_TransitionTime_04");
		}

		// AmbientFactor: 1. Off (0%); 2. Low (33%); 3. Medium (66%); 4. Normal (100%); 5. High (125%); 6. Ultra (150%)
		if (m_wComboAmbientFactor)
		{
			m_wComboAmbientFactor.ClearAll();
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_01");
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_02");
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_03");
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_04");
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_05");
			m_wComboAmbientFactor.AddItem("#BPR-ParameterSetupDialog_Cmb_AmbientFactor_06");
		}

		// Populate WeatherMode dynamically depending on Open-Meteo availability
		PopulateWeatherModeComboBox();
	}

	//------------------------------------------------------------------------------------------------
	//! Populates WeatherMode ComboBox depending on verified Open-Meteo API availability
	protected void PopulateWeatherModeComboBox()
	{
		if (!m_wComboWeatherMode)
			return;

		m_wComboWeatherMode.ClearAll();
		m_wComboWeatherMode.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherMode_01");
		m_wComboWeatherMode.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherMode_02");

		if (m_bOpenMeteoAvailable)
		{
			m_wComboWeatherMode.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherMode_03");
			m_wComboWeatherMode.AddItem("#BPR-ParameterSetupDialog_Cmb_WeatherMode_04");

			if (m_wMsgBoxWeather)
				m_wMsgBoxWeather.SetVisible(false);
		}
		else
		{
			if (m_wMsgBoxWeather)
			{
				m_wMsgBoxWeather.SetVisible(true);
				m_wMsgBoxWeather.SetColor(m_pColorError);
				m_wMsgBoxWeather.SetText("#BPR-ParameterSetupDialog_Msg_ERR_OpenMeteoApi");
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Fetches ServerConfig, status notice, and Open-Meteo diagnostics (directly in SP, or via network request in MP)
	protected void FetchServerConfig()
	{
		// Singleplayer / Workbench without network
		if (RplSession.Mode() == RplMode.None)
		{
			BPR_FetchOpenMeteoData pOmData = BPR_FetchOpenMeteoData.GetInstance();
			if (pOmData)
				pOmData.GetOnCheckFinished().Insert(OnOpenMeteoCheckFinished);

			BPR_ServerConfig pLocalConfig = BPR_JsonConfigHandler.GetConfig();
			string sLocalNotice = BPR_JsonConfigHandler.GetStatusNotice();
			m_eOpenMeteoStatus = BPR_FetchOpenMeteoData.GetStatus();
			m_bOpenMeteoAvailable = BPR_FetchOpenMeteoData.IsAvailable();
			m_sOpenMeteoNotice = BPR_FetchOpenMeteoData.GetDiagnosticNotice();

			OnConfigDataReady(pLocalConfig, sLocalNotice, m_eOpenMeteoStatus, m_sOpenMeteoNotice);
			return;
		}

		// Multiplayer: Request from server via local player network component
		BPR_PlayerNetworkComponent pNetComp = BPR_PlayerNetworkComponent.GetLocalPlayerNetworkComponent();
		if (pNetComp)
		{
			pNetComp.GetOnClientResponseReceived().Insert(OnClientResponseReceived);
			pNetComp.SendRequestToServer(BPR_ENetworkMessageType.REQUEST_SERVER_CONFIG);
			DebugLog.Info(CALLER_ID, "Requested ServerConfig from server.");
		}
		else
		{
			DebugLog.Warn(CALLER_ID, "BPR_PlayerNetworkComponent not found on local player!");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Asynchronous callback when Open-Meteo connectivity check completes in SP/Workbench
	protected void OnOpenMeteoCheckFinished(bool bIsAvailable, BPR_EOpenMeteoStatus eStatus, string sDiagnostic)
	{
		m_bOpenMeteoAvailable = bIsAvailable;
		m_eOpenMeteoStatus = eStatus;
		m_sOpenMeteoNotice = sDiagnostic;

		PopulateWeatherModeComboBox();
		RefreshWidgetDependencies();

		DebugLog.Info(CALLER_ID, string.Format("Open-Meteo check completed in dialog. Available=%1, Status=%2", bIsAvailable, typename.EnumToString(BPR_EOpenMeteoStatus, eStatus)));
	}

	//------------------------------------------------------------------------------------------------
	//! Network response listener on client
	protected void OnClientResponseReceived(BPR_ENetworkMessageType eType, string sPayload)
	{
		if (eType == BPR_ENetworkMessageType.RESPONSE_SERVER_CONFIG)
		{
			BPR_ServerConfig pReceivedConfig;
			string sNotice;
			BPR_EOpenMeteoStatus eOmStatus;
			string sOmNotice;
			BPR_JsonConfigHandler.UnpackConfigPayload(sPayload, pReceivedConfig, sNotice, eOmStatus, sOmNotice);

			m_eOpenMeteoStatus = eOmStatus;
			m_bOpenMeteoAvailable = (eOmStatus == BPR_EOpenMeteoStatus.AVAILABLE);
			m_sOpenMeteoNotice = sOmNotice;

			OnConfigDataReady(pReceivedConfig, sNotice, eOmStatus, sOmNotice);
		}
		else if (eType == BPR_ENetworkMessageType.RESPONSE_SAVE_CONFIG)
		{
			if (sPayload == "ok")
			{
				// Update m_pOriginalConfig to newly saved JSON state
				if (m_pServerConfig)
				{
					if (!m_pOriginalConfig)
						m_pOriginalConfig = new BPR_ServerConfig();
					m_pOriginalConfig.FromParamArray(m_pServerConfig.ToParamArray());
				}

				m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_SUC_JsonSave";
				UpdateStatusNoticeDisplay();
				DebugLog.Info(CALLER_ID, "Server confirmed successful config save.");
			}
			else
			{
				m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_ERR_JsonSave";
				UpdateStatusNoticeDisplay();
				DebugLog.Warn(CALLER_ID, "Server reported error saving config.");
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Called when configuration data, status notice, and Open-Meteo diagnostics are ready to display
	protected void OnConfigDataReady(BPR_ServerConfig pConfig, string sNotice, BPR_EOpenMeteoStatus eOmStatus, string sOmNotice)
	{
		m_pServerConfig = pConfig;

		// Create deep copy of originally loaded config for Reset functionality
		if (pConfig)
		{
			m_pOriginalConfig = new BPR_ServerConfig();
			m_pOriginalConfig.FromParamArray(pConfig.ToParamArray());
		}

		m_sStatusNotice = sNotice;
		m_eOpenMeteoStatus = eOmStatus;
		m_bOpenMeteoAvailable = (eOmStatus == BPR_EOpenMeteoStatus.AVAILABLE);
		m_sOpenMeteoNotice = sOmNotice;

		// Re-populate WeatherMode ComboBox now that API availability is confirmed
		PopulateWeatherModeComboBox();

		// Apply configuration values to widgets
		ApplyConfigToWidgets();

		// Display status notice with color level
		UpdateStatusNoticeDisplay();

		// Start AFK auto-start timer
		StartSetupTimer();

		if (pConfig)
		{
			DebugLog.Info(CALLER_ID, "ServerConfig applied.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Populates all widgets with values from m_pServerConfig, applying sanitization and bounds checking
	protected void ApplyConfigToWidgets()
	{
		ref BPR_ServerConfig pDefaults = new BPR_ServerConfig();
		ref BPR_ServerConfig pCfg = m_pServerConfig;
		if (!pCfg)
			pCfg = pDefaults;

		// 1. DateMode (1..3 -> Index 0..2)
		int iDateMode = pCfg.iDateMode;
		if (iDateMode < 1 || iDateMode > 3)
			iDateMode = pDefaults.iDateMode;
		if (m_wComboDateMode)
			m_wComboDateMode.SetCurrentItem(iDateMode - 1);

		// 2. StartDate
		string sStartDate = pCfg.sStartDate;
		int iDay, iMonth, iYear;
		if (!BPR_DateTimeUtility.ParseDate(sStartDate, iDay, iMonth, iYear))
			sStartDate = pDefaults.sStartDate;
		if (m_wInputDate)
			m_wInputDate.SetText(sStartDate);

		// 3. TimeMode (1..4 -> Index 0..3)
		int iTimeMode = pCfg.iTimeMode;
		if (iTimeMode < 1 || iTimeMode > 4)
			iTimeMode = pDefaults.iTimeMode;
		if (m_wComboTimeMode)
			m_wComboTimeMode.SetCurrentItem(iTimeMode - 1);

		// 4. TimezoneUTC (-12..14 -> Index 0..26)
		int iTimezone = pCfg.iTimezoneUTC;
		if (iTimezone < -12 || iTimezone > 14)
			iTimezone = pDefaults.iTimezoneUTC;
		if (m_wComboTimezoneUTC)
			m_wComboTimezoneUTC.SetCurrentItem(iTimezone + 12);

		// 5. SummerTime
		if (m_wCheckSummertime)
			m_wCheckSummertime.SetChecked(pCfg.bSummerTime);

		// 6. CustomHour (0..23 -> Index 0..23)
		int iHour = pCfg.iCustomHour;
		if (iHour < 0 || iHour > 23)
			iHour = pDefaults.iCustomHour;
		if (m_wComboCustomHour)
			m_wComboCustomHour.SetCurrentItem(iHour);

		// 7. WeatherMode (1..4 -> Index 0..3, max 2 if API unavailable)
		int iWeatherMode = pCfg.iWeatherMode;
		int iMaxWeatherMode = 4;
		if (!m_bOpenMeteoAvailable)
			iMaxWeatherMode = 2;

		if (iWeatherMode < 1 || iWeatherMode > iMaxWeatherMode)
			iWeatherMode = 1;
		if (m_wComboWeatherMode)
			m_wComboWeatherMode.SetCurrentItem(iWeatherMode - 1);

		// 8. StartWeather (0..4 -> Index 0..4)
		int iStartWeather = pCfg.iStartWeather;
		if (iStartWeather < 0 || iStartWeather > 4)
			iStartWeather = pDefaults.iStartWeather;
		if (m_wComboStartWeather)
			m_wComboStartWeather.SetCurrentItem(iStartWeather);

		// 9. WeatherTransitions (0..4 -> Index 0..4: 0. Random, 1. Never, 2. 60min, 3. 30min, 4. 10min)
		int iTransitions = pCfg.iWeatherTransitions;
		if (iTransitions < 0 || iTransitions > 4)
			iTransitions = pDefaults.iWeatherTransitions;
		if (m_wComboWeatherTransition)
			m_wComboWeatherTransition.SetCurrentItem(iTransitions);

		// 10. TransitionTime (0..4 -> Index 0..4: 0. Random, 1. 30min, 2. 15min, 3. 7.5min, 4. 5min)
		int iTransitionTime = pCfg.iTransitionTime;
		if (iTransitionTime < 0 || iTransitionTime > 4)
			iTransitionTime = pDefaults.iTransitionTime;
		if (m_wComboTransitionTime)
			m_wComboTransitionTime.SetCurrentItem(iTransitionTime);

		// 11. Coordinates
		string sCoords = pCfg.sCoordinates;
		float fLat, fLon;
		if (!BPR_MapUtility.ParseCoordinates(sCoords, fLat, fLon))
			sCoords = pDefaults.sCoordinates;
		if (m_wInputLatLon)
			m_wInputLatLon.SetText(sCoords);

		// 12. AmbientFactor (1..6 -> Index 0..5)
		int iAmbient = pCfg.iAmbientFactor;
		if (iAmbient < 1 || iAmbient > 6)
			iAmbient = pDefaults.iAmbientFactor;
		if (m_wComboAmbientFactor)
			m_wComboAmbientFactor.SetCurrentItem(iAmbient - 1);

		// 13. DebugMode
		if (m_wCheckDebugMode)
			m_wCheckDebugMode.SetChecked(pCfg.bDebugMode);

		// Refresh active/inactive states across all dependent widgets
		RefreshWidgetDependencies();
	}

	//------------------------------------------------------------------------------------------------
	//! Dynamically locks/unlocks and greys out dependent input fields
	protected void RefreshWidgetDependencies()
	{
		// 1. Date Mode Dependencies
		int iDateModeIdx = 1;
		if (m_wComboDateMode)
			iDateModeIdx = m_wComboDateMode.GetCurrentItem();

		// Mode 3 (Free date, index 2) -> StartDate enabled; otherwise disabled
		bool bEnableDate = (iDateModeIdx == 2);
		SetWidgetState(m_wInputDate, m_wLblStartDate, bEnableDate);

		// 2. Time Mode Dependencies
		int iTimeModeIdx = 2;
		if (m_wComboTimeMode)
			iTimeModeIdx = m_wComboTimeMode.GetCurrentItem();

		// Mode 1 (UTC time, index 0): Timezone + Summertime
		// Mode 2 (Choose hour, index 1): Custom Hour
		// Mode 3 (Random hour, index 2): All locked
		// Mode 4 (Maptime, index 3): Summertime
		bool bEnableTimezone = (iTimeModeIdx == 0);
		bool bEnableSummertime = (iTimeModeIdx == 0 || iTimeModeIdx == 3);
		bool bEnableCustomHour = (iTimeModeIdx == 1);

		SetWidgetState(m_wComboTimezoneUTC, m_wLblTimezoneUTC, bEnableTimezone);
		SetWidgetState(m_wCheckSummertime, m_wLblSummertime, bEnableSummertime);
		SetWidgetState(m_wComboCustomHour, m_wLblCustomHour, bEnableCustomHour);

		// 3. Weather Mode Dependencies
		int iWeatherModeIdx = 0;
		if (m_wComboWeatherMode)
			iWeatherModeIdx = m_wComboWeatherMode.GetCurrentItem();

		// Mode 1 (System, index 0): Startweather
		// Mode 2 (Simple, index 1): Startweather + Transitions + Transitiontime
		// Mode 3 (Map weather, index 2): None
		// Mode 4 (Own weather, index 3): Coordinates
		bool bEnableStartWeather = (iWeatherModeIdx == 0 || iWeatherModeIdx == 1);
		bool bEnableTransitions = (iWeatherModeIdx == 1);
		bool bEnableCoordinates = (iWeatherModeIdx == 3);

		SetWidgetState(m_wComboStartWeather, m_wLblStartWeather, bEnableStartWeather);
		SetWidgetState(m_wComboWeatherTransition, m_wLblTransitions, bEnableTransitions);
		SetWidgetState(m_wComboTransitionTime, m_wLblTransitionTime, bEnableTransitions);
		SetWidgetState(m_wInputLatLon, m_wLblLatLon, bEnableCoordinates);
	}

	//------------------------------------------------------------------------------------------------
	//! Helper to toggle widget enabled state and opacity
	protected void SetWidgetState(Widget wWidget, Widget wLabel, bool bEnabled)
	{
		float fOpacity = 0.35;
		if (bEnabled)
			fOpacity = 1.0;

		if (wWidget)
		{
			wWidget.SetEnabled(bEnabled);
			wWidget.SetOpacity(fOpacity);
		}

		if (wLabel)
		{
			wLabel.SetOpacity(fOpacity);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Displays the status notice in m_wMsgBoxInfo with dynamic color grading based on stringtable indicators
	protected void UpdateStatusNoticeDisplay()
	{
		if (!m_wMsgBoxInfo)
			return;

		if (m_sStatusNotice == "")
		{
			m_wMsgBoxInfo.SetText("");
			return;
		}

		m_wMsgBoxInfo.SetText(m_sStatusNotice);

		// Determine color level from Stringtable indicator: _ERR (Red), _WAR (Orange), _SUC (Green), _INF (Blue)
		string sUpper = m_sStatusNotice;
		sUpper.ToUpper();

		if (sUpper.Contains("_ERR"))
		{
			m_wMsgBoxInfo.SetColor(m_pColorError);
		}
		else if (sUpper.Contains("_WAR"))
		{
			m_wMsgBoxInfo.SetColor(m_pColorWarning);
		}
		else if (sUpper.Contains("_SUC"))
		{
			m_wMsgBoxInfo.SetColor(m_pColorSuccess);
		}
		else if (sUpper.Contains("_INF"))
		{
			m_wMsgBoxInfo.SetColor(m_pColorInfo);
		}
		else
		{
			// Fallback: search for legacy keywords in plain text messages
			string sLower = m_sStatusNotice;
			sLower.ToLower();

			if (sLower.Contains("erfolg") || sLower.Contains("success") || sLower.Contains("geladen"))
			{
				m_wMsgBoxInfo.SetColor(m_pColorSuccess);
			}
			else if (sLower.Contains("warnung") || sLower.Contains("ersetzt") || sLower.Contains("zurueckgesetzt"))
			{
				m_wMsgBoxInfo.SetColor(m_pColorWarning);
			}
			else
			{
				m_wMsgBoxInfo.SetColor(m_pColorError);
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Strict validation used by Save and Start buttons (does not auto-replace, returns false on errors)
	protected bool ValidateInputsStrict(out string sMessageBox)
	{
		sMessageBox = "";

		// Date validation only required if DateMode == 3 (Free date)
		int iDateModeIdx = 1;
		if (m_wComboDateMode)
			iDateModeIdx = m_wComboDateMode.GetCurrentItem();

		if (iDateModeIdx == 2 && m_wInputDate)
		{
			string sDate = m_wInputDate.GetText().Trim();
			int iDay, iMonth, iYear;
			if (!BPR_DateTimeUtility.ParseDate(sDate, iDay, iMonth, iYear))
			{
				sMessageBox = "#BPR-ParameterSetupDialog_Msg_ERR_Date";
				if (m_wMsgBoxDate)
				{
					m_wMsgBoxDate.SetVisible(true);
					m_wMsgBoxDate.SetColor(m_pColorError);
					m_wMsgBoxDate.SetText(sMessageBox);
				}
				return false;
			}
			else
			{
				// Cleanly format date in canonical dd.mm.yyyy representation
				m_wInputDate.SetText(BPR_DateTimeUtility.FormatDate(iDay, iMonth, iYear));
			}
		}

		if (m_wMsgBoxDate)
			m_wMsgBoxDate.SetVisible(false);

		// Coordinates validation only required if WeatherMode == 4 (Own weather)
		int iWeatherModeIdx = 0;
		if (m_wComboWeatherMode)
			iWeatherModeIdx = m_wComboWeatherMode.GetCurrentItem();

		if (iWeatherModeIdx == 3 && m_wInputLatLon)
		{
			string sCoords = m_wInputLatLon.GetText().Trim();
			float fLat, fLon;
			if (!BPR_MapUtility.ParseCoordinates(sCoords, fLat, fLon))
			{
				sMessageBox = "#BPR-ParameterSetupDialog_Msg_ERR_Coordinates";
				if (m_wMsgBoxCoordinates)
				{
					m_wMsgBoxCoordinates.SetVisible(true);
					m_wMsgBoxCoordinates.SetColor(m_pColorError);
					m_wMsgBoxCoordinates.SetText(sMessageBox);
				}
				return false;
			}
			else
			{
				// Cleanly format coordinates as Lat, Lon
				m_wInputLatLon.SetText(string.Format("%1, %2", fLat, fLon));
			}
		}

		if (m_wMsgBoxCoordinates)
			m_wMsgBoxCoordinates.SetVisible(false);

		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Fallback validation used by AFK timer expiration (replaces invalid inputs with safe defaults)
	//  Void is redundant; it is replaced by the final validation, including the log entry, within the modules.
	protected void ValidateInputsFallback()
	{
		// Date fallback
		if (m_wInputDate)
		{
			string sCurrentDate = m_wInputDate.GetText().Trim();
			int iDay, iMonth, iYear;
			if (!BPR_DateTimeUtility.ParseDate(sCurrentDate, iDay, iMonth, iYear))
			{
				m_wInputDate.SetText("16.11.2023");
				DebugLog.Info(CALLER_ID, "Timer auto-fallback: Reset invalid date to '16.11.2023'.");
			}
		}

		if (m_wMsgBoxDate)
			m_wMsgBoxDate.SetVisible(false);

		// Coordinates fallback
		if (m_wInputLatLon)
		{
			string sCurrentCoords = m_wInputLatLon.GetText().Trim();
			float fLat, fLon;
			if (!BPR_MapUtility.ParseCoordinates(sCurrentCoords, fLat, fLon))
			{
				string sDefaultCoords = string.Format("%1, %2", BPR_MapUtility.DEFAULT_FALLBACK_LAT, BPR_MapUtility.DEFAULT_FALLBACK_LON);
				m_wInputLatLon.SetText(sDefaultCoords);
				DebugLog.Info(CALLER_ID, string.Format("Timer auto-fallback: Reset invalid coordinates to '%1'.", sDefaultCoords));
			}
		}

		if (m_wMsgBoxCoordinates)
			m_wMsgBoxCoordinates.SetVisible(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Reads all current widget values into m_pServerConfig
	void SaveWidgetsToConfig()
	{
		if (!m_pServerConfig)
			m_pServerConfig = new BPR_ServerConfig();

		if (m_wComboDateMode)
			m_pServerConfig.iDateMode = m_wComboDateMode.GetCurrentItem() + 1;

		if (m_wInputDate)
			m_pServerConfig.sStartDate = m_wInputDate.GetText().Trim();

		if (m_wComboTimeMode)
			m_pServerConfig.iTimeMode = m_wComboTimeMode.GetCurrentItem() + 1;

		if (m_wComboTimezoneUTC)
			m_pServerConfig.iTimezoneUTC = m_wComboTimezoneUTC.GetCurrentItem() - 12;

		if (m_wCheckSummertime)
			m_pServerConfig.bSummerTime = m_wCheckSummertime.IsChecked();

		if (m_wComboCustomHour)
			m_pServerConfig.iCustomHour = m_wComboCustomHour.GetCurrentItem();

		if (m_wComboWeatherMode)
			m_pServerConfig.iWeatherMode = m_wComboWeatherMode.GetCurrentItem() + 1;

		if (m_wComboStartWeather)
			m_pServerConfig.iStartWeather = m_wComboStartWeather.GetCurrentItem();

		if (m_wComboWeatherTransition)
			m_pServerConfig.iWeatherTransitions = m_wComboWeatherTransition.GetCurrentItem();

		if (m_wComboTransitionTime)
			m_pServerConfig.iTransitionTime = m_wComboTransitionTime.GetCurrentItem();

		if (m_wInputLatLon)
			m_pServerConfig.sCoordinates = m_wInputLatLon.GetText().Trim();

		if (m_wComboAmbientFactor)
			m_pServerConfig.iAmbientFactor = m_wComboAmbientFactor.GetCurrentItem() + 1;

		if (m_wCheckDebugMode)
			m_pServerConfig.bDebugMode = m_wCheckDebugMode.IsChecked();

		DebugLog.Info(CALLER_ID, "Widgets saved in m_pServerConfig.");
	}

	//------------------------------------------------------------------------------------------------
	//! Packs configuration parameters into a semicolon-separated string
	protected string PackConfigString(BPR_ServerConfig pConfig)
	{
		if (!pConfig)
			return "";

		ref array<string> aParams = pConfig.ToParamArray();
		string sResult = "";
		for (int iIdx = 0; iIdx < aParams.Count(); iIdx++)
		{
			if (iIdx > 0)
				sResult += ";";
			sResult += aParams[iIdx];
		}
		return sResult;
	}

	//------------------------------------------------------------------------------------------------
	//! Locks Start, Save, and Reset buttons and displays mission launch status notice
	protected void LockButtonsForStart()
	{
		if (m_wButtonStart)
		{
			m_wButtonStart.SetEnabled(false);
			m_wButtonStart.SetOpacity(0.4);
		}

		if (m_wButtonSave)
		{
			m_wButtonSave.SetEnabled(false);
			m_wButtonSave.SetOpacity(0.4);
		}

		if (m_wButtonReset)
		{
			m_wButtonReset.SetEnabled(false);
			m_wButtonReset.SetOpacity(0.4);
		}

		m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_INF_StartingMission";
		UpdateStatusNoticeDisplay();
	}

	//------------------------------------------------------------------------------------------------
	//! Starts AFK background setup timer
	protected void StartSetupTimer()
	{
		m_fTimerRemaining = m_fTimerDuration;
		m_bTimerActive = true;

		GetGame().GetCallqueue().Remove(OnTimerTick);
		GetGame().GetCallqueue().CallLater(OnTimerTick, 1000, true);
	}

	//------------------------------------------------------------------------------------------------
	//! Resets setup timer upon user interaction
	protected void ResetTimer()
	{
		m_fTimerRemaining = m_fTimerDuration;

		if (m_wDisplaySetupTimer && (!m_wCheckSetupTimer || !m_wCheckSetupTimer.IsChecked()))
			m_wDisplaySetupTimer.SetVisible(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Timer tick callback running once per second
	protected void OnTimerTick()
	{
		if (!m_bTimerActive)
			return;

		// If setup timer checkbox is checked, pause timer
		if (m_wCheckSetupTimer && m_wCheckSetupTimer.IsChecked())
		{
			if (m_wDisplaySetupTimer)
			{
				m_wDisplaySetupTimer.SetVisible(true);
				m_wDisplaySetupTimer.SetColor(m_pColorWarning);
				m_wDisplaySetupTimer.SetText("#BPR-ParameterSetupDialog_Msg_WAR_SetupTimerPaused");
			}
			return;
		}

		m_fTimerRemaining -= 1.0;

		// Warning display in last 15 seconds
		if (m_fTimerRemaining <= 15.0 && m_fTimerRemaining > 0.0)
		{
			if (m_wDisplaySetupTimer)
			{
				m_wDisplaySetupTimer.SetVisible(true);
				m_wDisplaySetupTimer.SetColor(m_pColorWarning);
				int iTimerRemaining = Math.Round(m_fTimerRemaining);
				m_wDisplaySetupTimer.SetText(string.Format(WidgetManager.Translate("#BPR-ParameterSetupDialog_Msg_WAR_SetupTimerAutostart"), iTimerRemaining));
			}
		}
		else if (m_fTimerRemaining > 15.0)
		{
			if (m_wDisplaySetupTimer)
				m_wDisplaySetupTimer.SetVisible(false);
		}

		// Timer expiration: Apply fallback defaults and launch mission
		if (m_fTimerRemaining <= 0.0)
		{
			m_bTimerActive = false;
			GetGame().GetCallqueue().Remove(OnTimerTick);

			if (m_wDisplaySetupTimer)
			{
				m_wDisplaySetupTimer.SetVisible(true);
				m_wDisplaySetupTimer.SetColor(m_pColorError);
				m_wDisplaySetupTimer.SetText("#BPR-ParameterSetupDialog_Msg_WAR_SetupTimerExpired");
			}

			SaveWidgetsToConfig();
			LockButtonsForStart();
			DebugLog.Info(CALLER_ID, "Setup-Timer abgelaufen: Fallback-Parameter angewendet -> Auto-Start der Mission.");

			ExecuteMissionLaunch(m_pServerConfig);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Reset button handler: Reverts input fields to original loaded JSON configuration
	protected void OnResetClicked()
	{
		ResetTimer();

		if (m_pOriginalConfig)
		{
			if (!m_pServerConfig)
				m_pServerConfig = new BPR_ServerConfig();

			m_pServerConfig.FromParamArray(m_pOriginalConfig.ToParamArray());
			ApplyConfigToWidgets();

			if (m_wMsgBoxDate)
				m_wMsgBoxDate.SetVisible(false);

			if (m_wMsgBoxCoordinates)
				m_wMsgBoxCoordinates.SetVisible(false);

			m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_INF_Reset";
			UpdateStatusNoticeDisplay();

			DebugLog.Info(CALLER_ID, "Reset clicked -> Widgets reverted to original JSON configuration.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Save button handler: Validates inputs strictly and writes configuration to JSON on server
	protected void OnSaveClicked()
	{
		ResetTimer();

		string sError = "";
		if (!ValidateInputsStrict(sError))
		{
			m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_ERR_Save" + sError;
			UpdateStatusNoticeDisplay();
			DebugLog.Warn(CALLER_ID, "Save aborted due to invalid inputs: " + sError);
			return;
		}

		SaveWidgetsToConfig();

		// Singleplayer / Workbench
		if (RplSession.Mode() == RplMode.None)
		{
			BPR_JsonConfigHandler.SetConfig(m_pServerConfig);
			bool bSaved = BPR_JsonConfigHandler.SaveActiveConfigToFile();

			if (bSaved)
			{
				// Update m_pOriginalConfig to newly saved JSON state
				if (m_pServerConfig)
				{
					if (!m_pOriginalConfig)
						m_pOriginalConfig = new BPR_ServerConfig();
					m_pOriginalConfig.FromParamArray(m_pServerConfig.ToParamArray());
				}

				m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_SUC_JsonSave";
				UpdateStatusNoticeDisplay();
			}
			else
			{
				m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_ERR_JsonSave";
				UpdateStatusNoticeDisplay();
			}
			return;
		}

		// Multiplayer: Send save request to server
		BPR_PlayerNetworkComponent pNetComp = BPR_PlayerNetworkComponent.GetLocalPlayerNetworkComponent();
		if (pNetComp)
		{
			string sPayload = PackConfigString(m_pServerConfig);
			pNetComp.SendRequestToServer(BPR_ENetworkMessageType.REQUEST_SAVE_CONFIG, sPayload);
			DebugLog.Info(CALLER_ID, "Sent REQUEST_SAVE_CONFIG to server.");
		}
		else
		{
			DebugLog.Warn(CALLER_ID, "Cannot save: Player network component not available!");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Start button handler: Validates inputs strictly and initiates launch sequence
	protected void OnStartClicked()
	{
		ResetTimer();

		string sError = "";
		if (!ValidateInputsStrict(sError))
		{
			m_sStatusNotice = "#BPR-ParameterSetupDialog_Msg_ERR_Start" + sError;
			UpdateStatusNoticeDisplay();
			DebugLog.Warn(CALLER_ID, "Start aborted due to invalid inputs: " + sError);
			return;
		}

		SaveWidgetsToConfig();

		// Stop timer
		m_bTimerActive = false;
		GetGame().GetCallqueue().Remove(OnTimerTick);

		// Lock buttons and show start progress message
		LockButtonsForStart();

		DebugLog.Info(CALLER_ID, "Start clicked -> Launching mission with active UI settings.");
		ExecuteMissionLaunch(m_pServerConfig);
	}

	//------------------------------------------------------------------------------------------------
	//! Executes mission launch: updates server RAM and notifies LoadingManager
	//! Dialog remains open until closed by BPR_MissionLoadingManagerComponent after the launch delay.
	protected void ExecuteMissionLaunch(BPR_ServerConfig pConfig)
	{
		// Singleplayer / Workbench
		if (RplSession.Mode() == RplMode.None)
		{
			// Update in-memory active server configuration ONLY (no file overwrite!)
			BPR_JsonConfigHandler.SetConfig(pConfig);

			BPR_MissionLoadingManagerComponent pLoadMgr = BPR_MissionLoadingManagerComponent.GetInstance();
			if (pLoadMgr)
				pLoadMgr.InitiateMissionLaunch();
			else
				CloseDialog();

			return;
		}

		// Multiplayer: Send confirmed config to server
		BPR_PlayerNetworkComponent pNetComp = BPR_PlayerNetworkComponent.GetLocalPlayerNetworkComponent();
		if (pNetComp)
		{
			string sPayload = PackConfigString(pConfig);
			pNetComp.SendRequestToServer(BPR_ENetworkMessageType.CONFIRM_START_MISSION, sPayload);
			DebugLog.Info(CALLER_ID, "Sent CONFIRM_START_MISSION to server.");
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Helper to check if a clicked widget is the target widget or any of its child elements
	protected bool IsWidgetOrChildOf(Widget wTarget, Widget wParent)
	{
		if (!wTarget || !wParent)
			return false;

		if (wTarget == wParent)
			return true;

		Widget wCurrent = wTarget.GetParent();
		while (wCurrent)
		{
			if (wCurrent == wParent)
				return true;
			wCurrent = wCurrent.GetParent();
		}

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! UI Event: Button / CheckBox clicks
	override bool OnClick(Widget w, int x, int y, int button)
	{
		ResetTimer();
		RefreshWidgetDependencies();

		// Check action buttons
		if (IsWidgetOrChildOf(w, m_wButtonReset))
		{
			OnResetClicked();
			return true;
		}

		if (IsWidgetOrChildOf(w, m_wButtonSave))
		{
			OnSaveClicked();
			return true;
		}

		if (IsWidgetOrChildOf(w, m_wButtonStart))
		{
			OnStartClicked();
			return true;
		}

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! UI Event: EditBox text change
	override bool OnChange(Widget w, bool finished)
	{
		ResetTimer();
		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! UI Event: ComboBox selection change
	override bool OnItemSelected(Widget w, int row, int column, int oldRow, int oldColumn)
	{
		ResetTimer();
		RefreshWidgetDependencies();
		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper to open this menu
	static BPR_ParameterSetupDialog OpenDialog()
	{
		MenuManager pMenuManager = GetGame().GetMenuManager();
		if (!pMenuManager)
			return null;

		return BPR_ParameterSetupDialog.Cast(pMenuManager.OpenMenu(ChimeraMenuPreset.BPR_ParameterSetupDialog));
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper to close this menu
	static void CloseDialog()
	{
		MenuManager pMenuManager = GetGame().GetMenuManager();
		if (!pMenuManager)
			return;

		pMenuManager.CloseMenuByPreset(ChimeraMenuPreset.BPR_ParameterSetupDialog);
	}
};
`
  },
      {
    id: 'server_fetch_open_meteo',
    name: 'BPR_FetchOpenMeteoData.c',
    path: 'Server/TimeAndWeather/Utilities/BPR_FetchOpenMeteoData.c',
    folder: 'Server/TimeAndWeather/Utilities',
    status: 'modified',
    description: 'Central service for Open-Meteo REST API: Pre-flight checks, 48-hour 15-min weather forecast retrieval, hourly cloud interpolation, autonomous 60-min loop, and intelligent retry ladder (1m, 3m, 5m, 15m).',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_FetchOpenMeteoData.c
// Author: Indy & AI Assistant
// Description: Central service for Open-Meteo REST API communication.
//              - Checks startup parameters (-restapi) and RestApi availability.
//              - Executes pre-flight ping during loading sequence.
//              - Fetches 48-hour (2-day) weather forecasts with 15-minute resolution:
//                Temperature, Precipitation, Wind (speed/dir/gusts), WMO Weather Code,
//                Humidity, Surface Pressure, and Visibility.
//              - Interpolates hourly cloud cover into synchronized 15-minute intervals.
//              - Autonomous loop with 60-minute refresh interval.
//              - Intelligent retry ladder on network failure (1m -> 3m -> 5m -> 15m).
//              - Thread-safe data getters for WeatherManager and TemperatureManager.
// ============================================================================

// ============================================================================
// JSON Data Structs (Enfusion Engine JsonApiStruct)
// ============================================================================

class BPR_OpenMeteoMinutely15Payload : JsonApiStruct
{
	ref array<string> time;
	ref array<float> temperature_2m;
	ref array<float> relative_humidity_2m;
	ref array<float> precipitation;
	ref array<int> weather_code;
	ref array<float> surface_pressure;
	ref array<float> visibility;
	ref array<float> wind_speed_10m;
	ref array<float> wind_direction_10m;
	ref array<float> wind_gusts_10m;

	void BPR_OpenMeteoMinutely15Payload()
	{
		time = new array<string>();
		temperature_2m = new array<float>();
		relative_humidity_2m = new array<float>();
		precipitation = new array<float>();
		weather_code = new array<int>();
		surface_pressure = new array<float>();
		visibility = new array<float>();
		wind_speed_10m = new array<float>();
		wind_direction_10m = new array<float>();
		wind_gusts_10m = new array<float>();

		RegV("time");
		RegV("temperature_2m");
		RegV("relative_humidity_2m");
		RegV("precipitation");
		RegV("weather_code");
		RegV("surface_pressure");
		RegV("visibility");
		RegV("wind_speed_10m");
		RegV("wind_direction_10m");
		RegV("wind_gusts_10m");
	}
};

class BPR_OpenMeteoHourlyPayload : JsonApiStruct
{
	ref array<string> time;
	ref array<float> cloud_cover;

	void BPR_OpenMeteoHourlyPayload()
	{
		time = new array<string>();
		cloud_cover = new array<float>();

		RegV("time");
		RegV("cloud_cover");
	}
};

class BPR_OpenMeteoForecastResponse : JsonApiStruct
{
	ref BPR_OpenMeteoMinutely15Payload minutely_15;
	ref BPR_OpenMeteoHourlyPayload hourly;

	void BPR_OpenMeteoForecastResponse()
	{
		minutely_15 = new BPR_OpenMeteoMinutely15Payload();
		hourly = new BPR_OpenMeteoHourlyPayload();

		RegV("minutely_15");
		RegV("hourly");
	}
};

// ============================================================================
// REST Callbacks
// ============================================================================

//------------------------------------------------------------------------------------------------
//! Internal callback to process asynchronous REST ping response
class BPR_OpenMeteoCheckCallback : RestCallback
{
	protected BPR_FetchOpenMeteoData m_pService;

	void BPR_OpenMeteoCheckCallback(BPR_FetchOpenMeteoData pService)
	{
		m_pService = pService;
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (m_pService)
			m_pService.OnCheckSuccess(data, dataSize);
	}

	override void OnError(int errorCode)
	{
		if (m_pService)
			m_pService.OnCheckError(errorCode);
	}

	override void OnTimeout()
	{
		if (m_pService)
			m_pService.OnCheckTimeout();
	}
};

//------------------------------------------------------------------------------------------------
//! Internal callback to process asynchronous 48h weather forecast response
class BPR_OpenMeteoDataCallback : RestCallback
{
	protected BPR_FetchOpenMeteoData m_pService;

	void BPR_OpenMeteoDataCallback(BPR_FetchOpenMeteoData pService)
	{
		m_pService = pService;
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (m_pService)
			m_pService.OnDataSuccess(data, dataSize);
	}

	override void OnError(int errorCode)
	{
		if (m_pService)
			m_pService.OnDataError(errorCode);
	}

	override void OnTimeout()
	{
		if (m_pService)
			m_pService.OnDataTimeout();
	}
};

// ============================================================================
// Central Service Class
// ============================================================================

class BPR_FetchOpenMeteoData
{
	const static string CALLER_ID = "FetchOM";
	const static string BASE_URL = "https://api.open-meteo.com/";
	const static string PING_ENDPOINT = "v1/forecast?latitude=0&longitude=0&current=temperature_2m";

	// Timing constants (in milliseconds)
	const static int INTERVAL_NORMAL_MS  = 3600000; // 60 minutes
	const static int RETRY_STEP_1_MS     = 60000;   // 1 minute
	const static int RETRY_STEP_2_MS     = 180000;  // 3 minutes
	const static int RETRY_STEP_3_MS     = 300000;  // 5 minutes
	const static int RETRY_STEP_4_MS     = 900000;  // 15 minutes
	const static int SAFETY_TIMEOUT_DATA_MS = 4000; // 4.0 seconds

	protected static ref BPR_FetchOpenMeteoData s_pInstance;

	// Pre-flight check state
	protected BPR_EOpenMeteoStatus m_eStatus = BPR_EOpenMeteoStatus.UNKNOWN;
	protected string m_sDiagnosticMessage = "Verbindungspruefung ausstehend.";
	protected bool m_bIsCheckComplete = false;
	protected bool m_bIsCheckRunning = false;
	protected ref ScriptInvoker m_OnCheckFinished;
	protected ref BPR_OpenMeteoCheckCallback m_pCheckCallback;

	// Forecast data state
	protected bool m_bIsFetching = false;
	protected bool m_bHasValidData = false;
	protected int m_iRetryStep = 0;
	protected float m_fActiveLat = 0.0;
	protected float m_fActiveLon = 0.0;
	protected string m_sActiveSource = "";
	protected ref ScriptInvoker m_OnWeatherDataUpdated;
	protected ref BPR_OpenMeteoDataCallback m_pDataCallback;

	// Synchronized 15-Minute Data Arrays (192 values for 48 hours)
	protected ref array<string> m_aTimes;
	protected ref array<float>  m_aTemperatures;
	protected ref array<float>  m_aRelativeHumidity;
	protected ref array<float>  m_aPrecipitations;
	protected ref array<int>    m_aWeatherCodes;
	protected ref array<float>  m_aSurfacePressure;
	protected ref array<float>  m_aVisibility;
	protected ref array<float>  m_aWindSpeeds;
	protected ref array<float>  m_aWindDirections;
	protected ref array<float>  m_aWindGusts;
	protected ref array<float>  m_aCloudCover; // Interpolated from hourly to 15-min

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_FetchOpenMeteoData()
	{
		m_OnCheckFinished = new ScriptInvoker();
		m_OnWeatherDataUpdated = new ScriptInvoker();

		m_aTimes = new array<string>();
		m_aTemperatures = new array<float>();
		m_aRelativeHumidity = new array<float>();
		m_aPrecipitations = new array<float>();
		m_aWeatherCodes = new array<int>();
		m_aSurfacePressure = new array<float>();
		m_aVisibility = new array<float>();
		m_aWindSpeeds = new array<float>();
		m_aWindDirections = new array<float>();
		m_aWindGusts = new array<float>();
		m_aCloudCover = new array<float>();
	}

	//------------------------------------------------------------------------------------------------
	//! Returns singleton instance
	static BPR_FetchOpenMeteoData GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_FetchOpenMeteoData();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired when connectivity check finishes
	ScriptInvoker GetOnCheckFinished()
	{
		return m_OnCheckFinished;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired when weather forecast updates (passes bool bSuccess)
	ScriptInvoker GetOnWeatherDataUpdated()
	{
		return m_OnWeatherDataUpdated;
	}

	// ===============================================================================================
	// PRE-FLIGHT CONNECTIVITY CHECK
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Checks universal CLI parameters for REST API permissions
	protected bool CheckCLIParam()
	{
		string sParamValue = "";

		bool bFound = System.GetCLIParam("restapi", sParamValue);
		if (!bFound)
			bFound = System.GetCLIParam("-restapi", sParamValue);

		if (!bFound)
		{
			if (System.IsCLIParam("restapi") || System.IsCLIParam("-restapi"))
				return true;

			return false;
		}

		if (sParamValue == "" || sParamValue == "*" || sParamValue.Contains("*"))
			return true;

		if (sParamValue.Contains("open-meteo.com"))
			return true;

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! Starts asynchronous connectivity pre-flight check
	void StartConnectivityCheck()
	{
		if (m_bIsCheckRunning)
			return;

		m_bIsCheckRunning = true;
		m_bIsCheckComplete = false;
		m_eStatus = BPR_EOpenMeteoStatus.UNKNOWN;
		DebugLog.Info(CALLER_ID, "Starte Open-Meteo Pre-Flight-Pruefung...");

		if (!CheckCLIParam())
		{
			CompleteCheck(BPR_EOpenMeteoStatus.CLI_PARAM_MISSING, "Startoption '-restapi=api.open-meteo.com' oder '-restapi=*' fehlt.");
			return;
		}

		RestApi pRestApi = GetGame().GetRestApi();
		if (!pRestApi)
		{
			CompleteCheck(BPR_EOpenMeteoStatus.REST_DISABLED, "Engine-REST-Subsystem ist auf diesem Server nicht verfuegbar.");
			return;
		}

		RestContext pContext = pRestApi.GetContext(BASE_URL);
		if (!pContext)
		{
			CompleteCheck(BPR_EOpenMeteoStatus.REST_DISABLED, "Konnte keinen REST-Context fuer api.open-meteo.com erstellen.");
			return;
		}

		m_pCheckCallback = new BPR_OpenMeteoCheckCallback(this);
		pContext.GET(m_pCheckCallback, PING_ENDPOINT);

		GetGame().GetCallqueue().CallLater(OnCheckSafetyTimeout, 2000, false);
	}

	void OnCheckSuccess(string sData, int iDataSize)
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);

		if (iDataSize > 0)
			CompleteCheck(BPR_EOpenMeteoStatus.AVAILABLE, "Verbindung zu Open-Meteo erfolgreich hergestellt.");
		else
			CompleteCheck(BPR_EOpenMeteoStatus.API_ERROR, "Open-Meteo antwortete mit leerem Datenpaket.");
	}

	void OnCheckError(int iErrorCode)
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);
		CompleteCheck(BPR_EOpenMeteoStatus.API_ERROR, string.Format("Netzwerkfehler (Code: %1) bei Verbindung zu Open-Meteo.", iErrorCode));
	}

	void OnCheckTimeout()
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);
		CompleteCheck(BPR_EOpenMeteoStatus.TIMEOUT_FIREWALL, "Zeitueberschreitung: Keine Antwort von Open-Meteo (Firewall oder DNS-Sperre).");
	}

	protected void OnCheckSafetyTimeout()
	{
		if (!m_bIsCheckComplete)
			CompleteCheck(BPR_EOpenMeteoStatus.TIMEOUT_FIREWALL, "Sicherheits-Timeout erreicht (keine Antwort vom Server).");
	}

	protected void CompleteCheck(BPR_EOpenMeteoStatus eStatus, string sDiagnostic)
	{
		m_bIsCheckRunning = false;
		m_bIsCheckComplete = true;
		m_eStatus = eStatus;
		m_sDiagnosticMessage = sDiagnostic;

		bool bIsAvailable = (eStatus == BPR_EOpenMeteoStatus.AVAILABLE);
		DebugLog.Info(CALLER_ID, string.Format("Pre-Flight abgeschlossen. Status: %1 (%2). Diagnose: %3", typename.EnumToString(BPR_EOpenMeteoStatus, eStatus), bIsAvailable, sDiagnostic));

		if (m_OnCheckFinished)
		{
			m_OnCheckFinished.Invoke(bIsAvailable, eStatus, sDiagnostic);
			m_OnCheckFinished.Clear();
		}
	}

	// ===============================================================================================
	// 48-HOUR WEATHER FORECAST RETRIEVAL & RETRY LADDER
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Public entry to start the periodic 48h weather forecast loop.
	//! Called by MissionLoadingManager once Weather Mode 3 or 4 is confirmed.
	void StartFetching(float fLat = 999.0, float fLon = 999.0)
	{
		if (fLat == 999.0 || fLon == 999.0)
		{
			BPR_MapUtility.GetOverrideCoordinates(m_fActiveLat, m_fActiveLon, m_sActiveSource);
		}
		else
		{
			m_fActiveLat = fLat;
			m_fActiveLon = fLon;
			m_sActiveSource = "ProvidedCoordinates";
		}

		m_iRetryStep = 0;
		DebugLog.Info(CALLER_ID, string.Format("Starte Wetter-Abfrage-Loop fuer Koordinaten: %1, %2 (%3)", m_fActiveLat, m_fActiveLon, m_sActiveSource));

		FetchWeatherData();
	}

	//------------------------------------------------------------------------------------------------
	//! Dispatches the asynchronous GET request to Open-Meteo
	void FetchWeatherData()
	{
		if (m_bIsFetching)
			return;

		RestApi pRestApi = GetGame().GetRestApi();
		if (!pRestApi)
		{
			DebugLog.Warn(CALLER_ID, "RestApi nicht verfuegbar. Plane erneuten Versuch.");
			ScheduleRetry();
			return;
		}

		RestContext pContext = pRestApi.GetContext(BASE_URL);
		if (!pContext)
		{
			DebugLog.Warn(CALLER_ID, "RestContext fuer api.open-meteo.com fehlgeschlagen.");
			ScheduleRetry();
			return;
		}

		m_bIsFetching = true;

		// Format coordinates with period separator
		string sLatStr = BPR_FormatNumber.FormatFloat(m_fActiveLat, 4, 1, false, "", ".");
		string sLonStr = BPR_FormatNumber.FormatFloat(m_fActiveLon, 4, 1, false, "", ".");

		string sEndpoint = string.Format("v1/forecast?latitude=%1&longitude=%2&minutely_15=temperature_2m,relative_humidity_2m,precipitation,weather_code,surface_pressure,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=cloud_cover&forecast_days=2", sLatStr, sLonStr);

		m_pDataCallback = new BPR_OpenMeteoDataCallback(this);
		pContext.GET(m_pDataCallback, sEndpoint);

		// Safety timeout
		GetGame().GetCallqueue().CallLater(OnDataSafetyTimeout, SAFETY_TIMEOUT_DATA_MS, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Success callback from RestCallback
	void OnDataSuccess(string sData, int iDataSize)
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;

		if (iDataSize <= 0 || sData == "")
		{
			DebugLog.Warn(CALLER_ID, "Open-Meteo Datenpaket ist leer.");
			ScheduleRetry();
			return;
		}

		ref BPR_OpenMeteoForecastResponse pResponse = new BPR_OpenMeteoForecastResponse();
		pResponse.ExpandFromRAW(sData);

		if (!pResponse.minutely_15 || !pResponse.minutely_15.time || pResponse.minutely_15.time.IsEmpty())
		{
			DebugLog.Warn(CALLER_ID, "Fehler beim Deserialisieren oder keine minutely_15 Wetterdaten im JSON vorhanden.");
			ScheduleRetry();
			return;
		}

		// Store parsed 15-minute arrays
		m_aTimes.Copy(pResponse.minutely_15.time);
		m_aTemperatures.Copy(pResponse.minutely_15.temperature_2m);
		m_aRelativeHumidity.Copy(pResponse.minutely_15.relative_humidity_2m);
		m_aPrecipitations.Copy(pResponse.minutely_15.precipitation);
		m_aWeatherCodes.Copy(pResponse.minutely_15.weather_code);
		m_aSurfacePressure.Copy(pResponse.minutely_15.surface_pressure);
		m_aVisibility.Copy(pResponse.minutely_15.visibility);
		m_aWindSpeeds.Copy(pResponse.minutely_15.wind_speed_10m);
		m_aWindDirections.Copy(pResponse.minutely_15.wind_direction_10m);
		m_aWindGusts.Copy(pResponse.minutely_15.wind_gusts_10m);

		int iTargetCount = m_aTimes.Count();

		// Interpolate hourly cloud cover into 15-minute array
		if (pResponse.hourly && !pResponse.hourly.cloud_cover.IsEmpty())
		{
			InterpolateHourlyCloudCover(pResponse.hourly.cloud_cover, iTargetCount);
		}
		else
		{
			m_aCloudCover.Clear();
			for (int i = 0; i < iTargetCount; i++)
				m_aCloudCover.Insert(0.0);
		}

		m_bHasValidData = true;
		m_iRetryStep = 0; // Reset retry ladder on success

		DebugLog.Info(CALLER_ID, string.Format("Wetterdaten erfolgreich aktualisiert: %1 Intervalle geladen. Aktuell: %2°C, Wettercode: %3, Wolken: %4%%",
			iTargetCount, m_aTemperatures[0], m_aWeatherCodes[0], m_aCloudCover[0]));

		if (m_OnWeatherDataUpdated)
			m_OnWeatherDataUpdated.Invoke(true);

		// Schedule next regular update in 60 minutes
		GetGame().GetCallqueue().Remove(FetchWeatherData);
		GetGame().GetCallqueue().CallLater(FetchWeatherData, INTERVAL_NORMAL_MS, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Error callback from RestCallback
	void OnDataError(int iErrorCode)
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, string.Format("Netzwerkfehler beim Abrufen der Wetterdaten (Code: %1).", iErrorCode));
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Timeout callback from RestCallback
	void OnDataTimeout()
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, "Timeout beim Abrufen der Wetterdaten von Open-Meteo.");
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Safety timeout if engine hangs
	protected void OnDataSafetyTimeout()
	{
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, "Sicherheits-Timeout bei Open-Meteo Datenabfrage erreicht.");
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Intelligent Retry Ladder: 1 min -> 3 min -> 5 min -> 15 min (repeats at 15 min)
	protected void ScheduleRetry()
	{
		int iDelayMs = RETRY_STEP_1_MS; // 1 min

		if (m_iRetryStep == 1)
			iDelayMs = RETRY_STEP_2_MS; // 3 min
		else if (m_iRetryStep == 2)
			iDelayMs = RETRY_STEP_3_MS; // 5 min
		else if (m_iRetryStep >= 3)
			iDelayMs = RETRY_STEP_4_MS; // 15 min

		int iNextStep = m_iRetryStep + 1;
		if (iNextStep > 3)
			iNextStep = 3;

		m_iRetryStep = iNextStep;

		int iDelayMinutes = Math.Round(iDelayMs / 60000.0);
		DebugLog.Info(CALLER_ID, string.Format("Wiederholungsversuch (Stufe %1) in %2 Minuten angesetzt.", m_iRetryStep, iDelayMinutes));

		GetGame().GetCallqueue().Remove(FetchWeatherData);
		GetGame().GetCallqueue().CallLater(FetchWeatherData, iDelayMs, false);

		if (!m_bHasValidData && m_OnWeatherDataUpdated)
			m_OnWeatherDataUpdated.Invoke(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Interpolates 48 hourly cloud cover values into 192 synchronized 15-minute values
	protected void InterpolateHourlyCloudCover(array<float> aHourlyClouds, int iTargetCount)
	{
		m_aCloudCover.Clear();

		if (!aHourlyClouds || aHourlyClouds.IsEmpty())
			return;

		int iHourCount = aHourlyClouds.Count();

		for (int iHour = 0; iHour < iHourCount; iHour++)
		{
			float fCurrentCloud = aHourlyClouds[iHour];
			float fNextCloud = fCurrentCloud;

			if (iHour + 1 < iHourCount)
				fNextCloud = aHourlyClouds[iHour + 1];

			for (int iStep = 0; iStep < 4; iStep++)
			{
				if (m_aCloudCover.Count() >= iTargetCount)
					break;

				float fT = iStep * 0.25;
				float fInterpolated = fCurrentCloud + ((fNextCloud - fCurrentCloud) * fT);
				float fRounded = Math.Clamp(Math.Round(fInterpolated * 10.0) * 0.1, 0.0, 100.0);
				m_aCloudCover.Insert(fRounded);
			}

			if (m_aCloudCover.Count() >= iTargetCount)
				break;
		}

		while (m_aCloudCover.Count() < iTargetCount)
		{
			m_aCloudCover.Insert(aHourlyClouds[iHourCount - 1]);
		}
	}

	// ===============================================================================================
	// GETTERS FOR WEATHER & TEMPERATURE MANAGERS
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Returns true if valid 48-hour forecast data is stored in memory
	static bool HasValidData()
	{
		if (!s_pInstance)
			return false;

		return s_pInstance.m_bHasValidData;
	}

	//------------------------------------------------------------------------------------------------
	//! Returns the number of available 15-minute intervals (normally 192 for 48 hours)
	static int GetDataCount()
	{
		if (!s_pInstance || !s_pInstance.m_bHasValidData)
			return 0;

		return s_pInstance.m_aTimes.Count();
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves all weather parameters for a specific interval index (0 to 191)
	static bool GetWeatherInterval(int iIndex, out float fTemp, out float fPrecip, out float fWindSpeed, out float fWindDir, out float fWindGust, out int iWeatherCode, out float fCloudCover, out float fHumidity, out float fVisibility, out float fPressure)
	{
		fTemp = 0.0;
		fPrecip = 0.0;
		fWindSpeed = 0.0;
		fWindDir = 0.0;
		fWindGust = 0.0;
		iWeatherCode = 0;
		fCloudCover = 0.0;
		fHumidity = 0.0;
		fVisibility = 10000.0;
		fPressure = 1013.25;

		if (!s_pInstance || !s_pInstance.m_bHasValidData)
			return false;

		if (iIndex < 0 || iIndex >= s_pInstance.m_aTimes.Count())
			return false;

		fTemp = s_pInstance.m_aTemperatures[iIndex];
		fPrecip = s_pInstance.m_aPrecipitations[iIndex];
		fWindSpeed = s_pInstance.m_aWindSpeeds[iIndex];
		fWindDir = s_pInstance.m_aWindDirections[iIndex];
		fWindGust = s_pInstance.m_aWindGusts[iIndex];
		iWeatherCode = s_pInstance.m_aWeatherCodes[iIndex];
		fCloudCover = s_pInstance.m_aCloudCover[iIndex];
		fHumidity = s_pInstance.m_aRelativeHumidity[iIndex];
		fVisibility = s_pInstance.m_aVisibility[iIndex];
		fPressure = s_pInstance.m_aSurfacePressure[iIndex];

		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves weather parameters for a specific in-game time:
	//! iDayIndex: 0 (today) or 1 (tomorrow)
	//! iHour: 0 to 23
	//! iMinute: 0 to 59
	static bool GetWeatherAtTime(int iDayIndex, int iHour, int iMinute, out float fTemp, out float fPrecip, out float fWindSpeed, out float fWindDir, out float fWindGust, out int iWeatherCode, out float fCloudCover, out float fHumidity, out float fVisibility, out float fPressure)
	{
		int iClampedDay = Math.Clamp(iDayIndex, 0, 1);
		int iClampedHour = Math.Clamp(iHour, 0, 23);
		int iClampedMinute = Math.Clamp(iMinute, 0, 59);

		int iInterval = (iClampedDay * 96) + (iClampedHour * 4) + (iClampedMinute / 15);
		return GetWeatherInterval(iInterval, fTemp, fPrecip, fWindSpeed, fWindDir, fWindGust, iWeatherCode, fCloudCover, fHumidity, fVisibility, fPressure);
	}

	// Direct Array Getters
	array<string> GetTimes()            { return m_aTimes; }
	array<float>  GetTemperatures()     { return m_aTemperatures; }
	array<float>  GetRelativeHumidity() { return m_aRelativeHumidity; }
	array<float>  GetPrecipitations()   { return m_aPrecipitations; }
	array<int>    GetWeatherCodes()     { return m_aWeatherCodes; }
	array<float>  GetSurfacePressure()  { return m_aSurfacePressure; }
	array<float>  GetVisibility()       { return m_aVisibility; }
	array<float>  GetWindSpeeds()       { return m_aWindSpeeds; }
	array<float>  GetWindDirections()   { return m_aWindDirections; }
	array<float>  GetWindGusts()        { return m_aWindGusts; }
	array<float>  GetCloudCover()       { return m_aCloudCover; }

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns whether Open-Meteo is verified and available
	static bool IsAvailable()
	{
		if (!s_pInstance)
			return false;

		return (s_pInstance.m_eStatus == BPR_EOpenMeteoStatus.AVAILABLE);
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns current status enum
	static BPR_EOpenMeteoStatus GetStatus()
	{
		if (!s_pInstance)
			return BPR_EOpenMeteoStatus.UNKNOWN;

		return s_pInstance.m_eStatus;
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns diagnostic message string
	static string GetDiagnosticNotice()
	{
		if (!s_pInstance)
			return "Nicht geprueft.";

		return s_pInstance.m_sDiagnosticMessage;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance and status (for mission restart / cleanup)
	static void Reset()
	{
		if (s_pInstance)
		{
			GetGame().GetCallqueue().Remove(s_pInstance.OnCheckSafetyTimeout);
			GetGame().GetCallqueue().Remove(s_pInstance.OnDataSafetyTimeout);
			GetGame().GetCallqueue().Remove(s_pInstance.FetchWeatherData);

			if (s_pInstance.m_OnCheckFinished)
				s_pInstance.m_OnCheckFinished.Clear();

			if (s_pInstance.m_OnWeatherDataUpdated)
				s_pInstance.m_OnWeatherDataUpdated.Clear();

			s_pInstance = null;
		}
	}
};
`
  },
        {
    id: 'server_custom_climate',
    name: 'BPR_CustomClimate.c',
    path: 'Server/TimeAndWeather/Utilities/BPR_CustomClimate.c',
    folder: 'Server/TimeAndWeather/Utilities',
    status: 'modified',
    description: 'Tier 1 of climate cascade: parses custom climate JSON including numeric ClimateZone (1-6) with information list.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_CustomClimate.c
// Author: Indy & AI Assistant
// Description: Server-side Custom Climate configuration and loader (Caller: CustClim).
//              First tier in the climate cascade:
//              1. Verifies $profile:BoilingPointReforger/ directory.
//              2. Checks existence of BPR_CustomClimate.json.
//              3. Writes formatted template with real blank lines if missing.
//              4. Reads configuration via JsonLoadContext.
//              5. If CustomClimate is true, parses 12-month min/max temperatures
//                 and numeric ClimateZone (1-6) into a unified BPR_ClimateProfile.
//              6. Validates data via BPR_ValidateClimateTable.
//              7. Creates error backup on syntax/validation corruption.
// ============================================================================

//------------------------------------------------------------------------------------------------
//! Utility handler for user-defined custom climate JSON
class BPR_CustomClimate
{
	const static string CALLER_ID = "CustClim";

	const static string CONFIG_FILE_PATH = BPR_VariablesConfig.CONFIG_DIR + "BPR_CustomClimate.json";
	const static string BACKUP_FILE_PATH = BPR_VariablesConfig.CONFIG_DIR + "BPR_CustomClimate_Backup.json";
	const static string ERROR_FILE_PATH  = BPR_VariablesConfig.CONFIG_DIR + "BPR_CustomClimate_Error.json";

	protected static ref array<string> m_aMonthNames = {
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	};

	//------------------------------------------------------------------------------------------------
	//! Tries to load custom climate. Returns valid BPR_ClimateProfile if active and valid, otherwise null.
	static BPR_ClimateProfile TryGetProfile()
	{
		// 1. Check directory
		if (!FileIO.FileExists(BPR_VariablesConfig.CONFIG_DIR))
		{
			FileIO.MakeDirectory(BPR_VariablesConfig.CONFIG_DIR);
			DebugLog.Info(CALLER_ID, "Subfolder for custom climate created: " + BPR_VariablesConfig.CONFIG_DIR);
		}

		// 2. Check file existence -> Create template if missing
		if (!FileIO.FileExists(CONFIG_FILE_PATH))
		{
			CreateDefaultTemplate(CONFIG_FILE_PATH);
			DebugLog.Info(CALLER_ID, "Custom climate file not found. Default template generated (CustomClimate=false).");
			return null;
		}

		// 3. Load JSON via JsonLoadContext
		ref JsonLoadContext pLoadContext = new JsonLoadContext();
		if (!pLoadContext.LoadFromFile(CONFIG_FILE_PATH))
		{
			DebugLog.Warn(CALLER_ID, "Custom climate JSON is corrupted or unreadable. Creating backup and regenerating template...");
			FileIO.CopyFile(CONFIG_FILE_PATH, ERROR_FILE_PATH);
			CreateDefaultTemplate(CONFIG_FILE_PATH);
			return null;
		}

		// 4. Check admin activation switch
		bool bCustomClimate = false;
		pLoadContext.ReadValue("CustomClimate", bCustomClimate);

		if (!bCustomClimate)
		{
			DebugLog.Info(CALLER_ID, "Custom climate is disabled in config (CustomClimate: false). Proceeding to next cascade tier.");
			return null;
		}

		// 5. Read optional climate name
		string sClimateName = "Custom Climate";
		pLoadContext.ReadValue("ClimateName", sClimateName);

		// 6. Read numeric ClimateZone (1-6)
		int iClimateZone = 1;
		pLoadContext.ReadValue("ClimateZone", iClimateZone);
		if (iClimateZone < 1 || iClimateZone > 6)
		{
			DebugLog.Warn(CALLER_ID, string.Format("Invalid ClimateZone ID (%1) in config. Defaulting to 1 (Continental).", iClimateZone));
			iClimateZone = 1;
		}

		// 7. Read 12 monthly min and max values
		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = sClimateName;
		pProfile.m_sSource = "CustomJson";
		pProfile.m_eClimateZone = BPR_ClimateProfile.IntToClimateZone(iClimateZone);

		bool bValidationSuccess = true;

		for (int i = 0; i < 12; i++)
		{
			string sMonth = m_aMonthNames[i];
			float fMin = 0.0;
			float fMax = 0.0;

			bool bReadMin = pLoadContext.ReadValue("Min_" + sMonth, fMin);
			bool bReadMax = pLoadContext.ReadValue("Max_" + sMonth, fMax);

			if (!bReadMin || !bReadMax)
			{
				DebugLog.Warn(CALLER_ID, string.Format("Missing climate data for month '%1'. Custom climate invalid.", sMonth));
				bValidationSuccess = false;
				break;
			}

			pProfile.m_aMinTemp.Insert(fMin);
			pProfile.m_aMaxTemp.Insert(fMax);
		}

		// 8. Validation check via BPR_ValidateClimateTable
		if (!bValidationSuccess || !BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Warn(CALLER_ID, "Custom climate validation failed. Creating error copy (BPR_CustomClimate_Error.json) and falling back.");
			FileIO.CopyFile(CONFIG_FILE_PATH, ERROR_FILE_PATH);
			return null;
		}

		string sZoneName = BPR_ClimateProfile.ClimateZoneToString(pProfile.m_eClimateZone);
		DebugLog.Info(CALLER_ID, string.Format("Custom climate '%1' loaded successfully (Zone: %2 | Jan: %3°C..%4°C | Jul: %5°C..%6°C).",
			sClimateName,
			sZoneName,
			pProfile.m_aMinTemp[0], pProfile.m_aMaxTemp[0],
			pProfile.m_aMinTemp[6], pProfile.m_aMaxTemp[6]));

		return pProfile;
	}

	//------------------------------------------------------------------------------------------------
	//! Generates nicely formatted default JSON template with real blank lines and section dividers
	protected static bool CreateDefaultTemplate(string sFilePath)
	{
		FileHandle pFile = FileIO.OpenFile(sFilePath, FileMode.WRITE);
		if (!pFile)
		{
			DebugLog.Err(CALLER_ID, string.Format("Failed to open file for writing: %1", sFilePath));
			return false;
		}

		pFile.WriteLine("{");
		pFile.WriteLine("\\t\\"DESCRIPTION\\": [");
		pFile.WriteLine("\\t\\t\\"--- Boiling Point Reforger Custom Climate Configuration ---\\",");
		pFile.WriteLine("\\t\\t\\"Set CustomClimate to true to activate this custom table.\\",");
		pFile.WriteLine("\\t\\t\\"Define monthly min/max temperatures in degrees Celsius.\\",");
		pFile.WriteLine("\\t\\t\\"----------------------------------------------------------\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"CustomClimate\\": false,");
		pFile.WriteLine("\\t\\"ClimateName\\": \\"Name for your map / scenario\\",");
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION CLIMATE ZONE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Climate Zone (1-6) ---\\",");
		pFile.WriteLine("\\t\\t\\"1. Continental   (Central / Eastern Europe - warm summer, cold winter)\\",");
		pFile.WriteLine("\\t\\t\\"2. Oceanic       (Coastal / Maritime - mild, wet, windy)\\",");
		pFile.WriteLine("\\t\\t\\"3. Mediterranean (Southern Europe - hot dry summer, mild winter)\\",");
		pFile.WriteLine("\\t\\t\\"4. Arid          (Desert / Steppe - extreme heat, dry air, cold night)\\",");
		pFile.WriteLine("\\t\\t\\"5. Tropical      (Equatorial / Jungle - hot, humid, year-round rain)\\",");
		pFile.WriteLine("\\t\\t\\"6. Subarctic     (Cold North - freezing winter, short cool summer)\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine("\\t\\"ClimateZone\\": 1,");
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION MINIMUM TEMPERATURE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Monthly Minimum Temperatures (Night / Early Dawn) ---\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine("\\t\\"Min_January\\": -2.0,");
		pFile.WriteLine("\\t\\"Min_February\\": -1.0,");
		pFile.WriteLine("\\t\\"Min_March\\": 2.0,");
		pFile.WriteLine("\\t\\"Min_April\\": 5.5,");
		pFile.WriteLine("\\t\\"Min_May\\": 9.5,");
		pFile.WriteLine("\\t\\"Min_June\\": 13.0,");
		pFile.WriteLine("\\t\\"Min_July\\": 15.0,");
		pFile.WriteLine("\\t\\"Min_August\\": 14.5,");
		pFile.WriteLine("\\t\\"Min_September\\": 11.0,");
		pFile.WriteLine("\\t\\"Min_October\\": 6.5,");
		pFile.WriteLine("\\t\\"Min_November\\": 2.5,");
		pFile.WriteLine("\\t\\"Min_December\\": -0.5,");
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION MAXIMUM TEMPERATURE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Monthly Maximum Temperatures (Day Peak / Solar Noon) ---\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine("\\t\\"Max_January\\": 3.0,");
		pFile.WriteLine("\\t\\"Max_February\\": 5.0,");
		pFile.WriteLine("\\t\\"Max_March\\": 10.0,");
		pFile.WriteLine("\\t\\"Max_April\\": 15.0,");
		pFile.WriteLine("\\t\\"Max_May\\": 19.5,");
		pFile.WriteLine("\\t\\"Max_June\\": 23.0,");
		pFile.WriteLine("\\t\\"Max_July\\": 25.5,");
		pFile.WriteLine("\\t\\"Max_August\\": 25.0,");
		pFile.WriteLine("\\t\\"Max_September\\": 20.0,");
		pFile.WriteLine("\\t\\"Max_October\\": 14.0,");
		pFile.WriteLine("\\t\\"Max_November\\": 7.5,");
		pFile.WriteLine("\\t\\"Max_December\\": 4.0");
		pFile.WriteLine("}");

		pFile.Close();
		DebugLog.Info(CALLER_ID, string.Format("Created default template: %1", sFilePath));
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Saves an active BPR_ClimateProfile to JSON with formatted blank lines
	static bool SaveProfileToFile(string sFilePath, BPR_ClimateProfile pProfile, bool bActive = true)
	{
		if (!pProfile || pProfile.m_aMinTemp.Count() != 12 || pProfile.m_aMaxTemp.Count() != 12)
			return false;

		FileHandle pFile = FileIO.OpenFile(sFilePath, FileMode.WRITE);
		if (!pFile)
			return false;

		string sActiveStr = "false";
		if (bActive)
			sActiveStr = "true";

		int iZoneID = BPR_ClimateProfile.ClimateZoneToInt(pProfile.m_eClimateZone);

		pFile.WriteLine("{");
		pFile.WriteLine("\\t\\"DESCRIPTION\\": [");
		pFile.WriteLine("\\t\\t\\"--- Boiling Point Reforger Custom Climate Configuration ---\\",");
		pFile.WriteLine("\\t\\t\\"Set CustomClimate to true to activate this custom table.\\",");
		pFile.WriteLine("\\t\\t\\"Define monthly min/max temperatures in degrees Celsius.\\",");
		pFile.WriteLine("\\t\\t\\"----------------------------------------------------------\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine("");
		pFile.WriteLine(string.Format("\\t\\"CustomClimate\\": %1,", sActiveStr));
		pFile.WriteLine(string.Format("\\t\\"ClimateName\\": \\"%1\\",", pProfile.m_sProfileName));
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION CLIMATE ZONE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Climate Zone (1-6) ---\\",");
		pFile.WriteLine("\\t\\t\\"1. Continental   (Central / Eastern Europe - warm summer, cold winter)\\",");
		pFile.WriteLine("\\t\\t\\"2. Oceanic       (Coastal / Maritime - mild, wet, windy)\\",");
		pFile.WriteLine("\\t\\t\\"3. Mediterranean (Southern Europe - hot dry summer, mild winter)\\",");
		pFile.WriteLine("\\t\\t\\"4. Arid          (Desert / Steppe - extreme heat, dry air, cold night)\\",");
		pFile.WriteLine("\\t\\t\\"5. Tropical      (Equatorial / Jungle - hot, humid, year-round rain)\\",");
		pFile.WriteLine("\\t\\t\\"6. Subarctic     (Cold North - freezing winter, short cool summer)\\"");
		pFile.WriteLine("\\t],");
		pFile.WriteLine(string.Format("\\t\\"ClimateZone\\": %1,", iZoneID));
		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION MINIMUM TEMPERATURE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Monthly Minimum Temperatures (Night / Early Dawn) ---\\"");
		pFile.WriteLine("\\t],");

		for (int i = 0; i < 12; i++)
		{
			pFile.WriteLine(string.Format("\\t\\"Min_%1\\": %2,", m_aMonthNames[i], pProfile.m_aMinTemp[i]));
		}

		pFile.WriteLine("");
		pFile.WriteLine("\\t\\"INFORMATION MAXIMUM TEMPERATURE\\": [");
		pFile.WriteLine("\\t\\t\\"--- Monthly Maximum Temperatures (Day Peak / Solar Noon) ---\\"");
		pFile.WriteLine("\\t],");

		for (int j = 0; j < 12; j++)
		{
			string sTrailingComma = ",";
			if (j == 11)
				sTrailingComma = "";
			pFile.WriteLine(string.Format("\\t\\"Max_%1\\": %2%3", m_aMonthNames[j], pProfile.m_aMaxTemp[j], sTrailingComma));
		}

		pFile.WriteLine("}");
		pFile.Close();
		return true;
	}
};
`
  },
    {
    id: 'server_weather_manager_core',
    name: 'BPR_WeatherManagerCore.c',
    path: 'Server/TimeAndWeather/BPR_WeatherManagerCore.c',
    folder: 'Server/TimeAndWeather',
    status: 'modified',
    description: 'Weather manager core dispatching Mode 2 Simple Weather and handling Random options.',
    createdAt: '2026-09-28',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherManagerCore.c
// Author: Indy & AI Assistant
// Description: Server-side Weather Manager Core class (Caller: WeMaCore).
//              Validates weather configuration parameters and coordinates
//              the appropriate specialized Weather Manager (Simple, System, OpenMeteo).
// ============================================================================

class BPR_WeatherManagerCore
{
	const static string CALLER_ID = "WeMaCore";

	protected bool m_bIsInitialized;
	protected int m_iWeatherMode;
	protected string m_sStartWeatherState;
	protected ref array<string> m_aWeatherTypes = {"Clear", "Cloudy", "Overcast", "Rainy"};
	protected int m_iWeatherTransition;
	protected int m_iTransitionTime;
	
	protected TimeAndWeatherManagerEntity m_pWeatherMgr;
	protected ref BPR_WeatherProviderSimple m_pWeatherProviderSimple;
	protected ref BPR_WeatherProviderSystem m_pWeatherProviderSystem;
	protected ref BPR_WeatherProviderOpenMeteo m_pWeatherProviderOpenMeteo;
	
	//------------------------------------------------------------------------------------------------
	//! Initializes Weather Manager Core and dispatches to the selected weather subsystem
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		// Get TimeAndWeatherManagerEntity
		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "TimeAndWeatherManagerEntity not found! Weather simulation cannot be initialized.");
			return;
		}

		// Load Server Configuration
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (!pConfig)
		{
			DebugLog.Err(CALLER_ID, "ServerConfig is null! Using default weather settings.");
			pConfig = new BPR_ServerConfig();
		}

		//------------------------------------------------------------------------------------------------
		// Validate Parameters
		// WeatherMode (1-4, default 1)
		int iWeatherMode = pConfig.iWeatherMode;
			
		if (iWeatherMode < 1 || iWeatherMode > 4)
		{
			DebugLog.Warn(CALLER_ID, string.Format("Invalid WeatherMode (%1) in config (Must be 1-4). Defaulting to 1 (System Weather).", iWeatherMode));
			iWeatherMode = 1;
		}
		m_iWeatherMode = iWeatherMode;
		
		// -----------------------------------------------------
		// Startweather, Transition and Transitiontime for WeatherMode 1 + 2
		if (m_iWeatherMode == 1 || m_iWeatherMode == 2)
		{
			// StartWeatherID (0-4, default 0)
			int iStartWeatherID = pConfig.iStartWeather;	
					
			if (iStartWeatherID < 0 || iStartWeatherID > 4)
			{
				DebugLog.Warn(CALLER_ID, string.Format("Invalid StartWeatherID (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iStartWeatherID));
				iStartWeatherID = 0;
			}
			if (iStartWeatherID == 0)
			{
				iStartWeatherID = Math.RandomIntInclusive(1, 4);
				DebugLog.Info(CALLER_ID, string.Format("Random StartWeatherID (%1).", iStartWeatherID));
			}
			else
			{
				DebugLog.Info(CALLER_ID, string.Format("Selected StartWeatherID (%1).", iStartWeatherID));
			}
			
			// Transition StartWeatherID to StartWeatherState
			m_sStartWeatherState = "Clear";
			
			if (iStartWeatherID >= 1 && iStartWeatherID <= m_aWeatherTypes.Count())
			{
				int index = iStartWeatherID - 1;
				
				m_sStartWeatherState = m_aWeatherTypes[index];
				DebugLog.Info(CALLER_ID, string.Format("StartWeather selected: %1.", m_sStartWeatherState));
			}			
			else
			{
				DebugLog.Warn(CALLER_ID, string.Format("Wrong index for WeatherState array. Default State used 'Clear'."));
			}			
			
			if (m_sStartWeatherState == "")
			{
				m_sStartWeatherState = "Clear";
				DebugLog.Warn(CALLER_ID, string.Format("Missing WeatherState. Default State used 'Clear'."));
			}	
			
			// -----------------------------------------------------
			// Weathertransitions and Transitiontime for Mode 2
			if (m_iWeatherMode == 2)
			{
				int iIndex = 0;
				
				// WeatherTransitions (0-4: 0. Random, 1. Never, 2. 60 min, 3. 30 min, 4. 10 min)
				int iWeatherTransition = pConfig.iWeatherTransitions;
				
				if (iWeatherTransition < 0 || iWeatherTransition > 4)
				{
					DebugLog.Warn(CALLER_ID, string.Format("Invalid WeatherTransition (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iWeatherTransition));
					iWeatherTransition = 0;
				}
				else
				{
					array<string> aWeatherTransitions = {"0. Random", "1. Never", "2. 60 min", "3. 30 min", "4. 10 min"};
					iIndex = iWeatherTransition;
					
					DebugLog.Info(CALLER_ID, string.Format("WeatherTransitions selected: %1.", aWeatherTransitions[iIndex]));
				}
				m_iWeatherTransition = iWeatherTransition;
		
				// TransitionTime (0-4: 0. Random, 1. 30 min, 2. 15 min, 3. 7.5 min, 4. 5 min)
				int iTransitionTime = pConfig.iTransitionTime;
				
				if (iTransitionTime < 0 || iTransitionTime > 4)
				{
					DebugLog.Warn(CALLER_ID, string.Format("Invalid TransitionTime (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iTransitionTime));
					iTransitionTime = 0;
				}
				else
				{
					array<string> aTransitionTime = {"0. Random", "1. 30 min", "2. 15 min", "3. 7.5 min", "4. 5 min"};
					iIndex = iTransitionTime;
					
					DebugLog.Info(CALLER_ID, string.Format("TransitionTime selected: %1.", aTransitionTime[iIndex]));
				}
				m_iTransitionTime = iTransitionTime;	
			}
		}
		
		//------------------------------------------------------------------------------------------------
		// Initialize Selected Weather System
		switch (m_iWeatherMode)
		{
			// Mode 1: System Weather Provider (Default)
			case 1:
			default:
			{
				DebugLog.Info(CALLER_ID, string.Format("Mode 1 (System Weather): Initialized with StartWeather: %1.", m_sStartWeatherState));
				m_pWeatherProviderSystem = new BPR_WeatherProviderSystem();
				m_pWeatherProviderSystem.Init(m_sStartWeatherState);		
			}
			break;
			
			// Mode 2: Simple Weather Provider
			case 2:
			{
				DebugLog.Info(CALLER_ID, string.Format("Mode 2 (Simple Weather): Initialized with StartWeather: %1.", m_sStartWeatherState));
				m_pWeatherProviderSimple = new BPR_WeatherProviderSimple();
				m_pWeatherProviderSimple.Init(m_sStartWeatherState, m_iWeatherTransition, m_iTransitionTime);
			}
			break;
			
			// Mode 3 + 4: Weather via Coordinates (Open-Meteo)
			case 3:
			case 4:
			{
				float fLatitude = 50.073;
				float fLongitude = 14.437;
				string sSource;
				
				// Mode 3: Map Weather via map Coordinates (Open-Meteo)
				if (m_iWeatherMode == 3)
				{
					string sMapName;
					float fMapLatitude, fMapLongitude;
				
					bool bMapname = BPR_MapUtility.GetMapName(sMapName);
					bool bOverrideCoordinates = BPR_MapUtility.GetMapCoordinates(fMapLatitude, fMapLongitude, sSource);
									
					string sCoordinates = BPR_MapUtility.FormatCoordinates(fMapLatitude, fMapLongitude);
					string sLowerSource = sSource;	
					sLowerSource.ToLower();
					
					fLatitude = fMapLatitude;
					fLongitude = fMapLongitude;
					
					// Override map location
					if (sLowerSource.Contains("override"))
					{
						string sOverrideLocation = BPR_VariablesConfig.OVERRIDE_LOCATION;
						
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Override coordinates (%1) found, using location %2 for %3.", sCoordinates, sOverrideLocation, sMapName));
					}
					// Original map location
					else if (sLowerSource.Contains("original"))
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Using map coordinates (%1) for %2.", sCoordinates, sMapName));
					}
					// Fallback location Bohemia HQ
					else
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Incorrect coordinates. Using fallback location Bohemia HQ (%1).", sCoordinates));
					}
				}
				
				// Mode 4: User Weather via Coordinates (Open-Meteo)
				else
				{
					float fCustomLatitude, fCustomLongitude;
					
					bool bUserCoordinates = BPR_MapUtility.GetUserCoordinates(pConfig.sCoordinates, fCustomLatitude, fCustomLongitude, sSource);
					
					fLatitude = fCustomLatitude;
					fLongitude = fCustomLongitude;
					
					if (sSource == "UserInput")
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 4 (Own Weather): Using coordinates %1.", BPR_MapUtility.FormatCoordinates(fLatitude, fLongitude)));
					}
					else
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 4 (Own Weather): Wrong user coordinates (%1). Using %2 coordinates (%3)", pConfig.sCoordinates, sSource, BPR_MapUtility.FormatCoordinates(fLatitude, fLongitude)));
					}
				}

				// Start real weather with defined coordinates
				m_pWeatherProviderOpenMeteo = new BPR_WeatherProviderOpenMeteo();
				m_pWeatherProviderOpenMeteo.Init(fLatitude, fLongitude);
			}
			break;
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Cleans up active weather provider and resets core state
	void Cleanup()
	{
		if (m_pWeatherProviderSimple)
		{
			m_pWeatherProviderSimple.Cleanup();
			m_pWeatherProviderSimple = null;
		}

		m_pWeatherProviderSystem = null;
		if (m_pWeatherProviderOpenMeteo)
		{
			m_pWeatherProviderOpenMeteo.Cleanup();
			m_pWeatherProviderOpenMeteo = null;
		}
		m_bIsInitialized = false;
	}
};
`
  },
    {
    id: 'server_weather_provider_system',
    name: 'BPR_WeatherProviderSystem.c',
    path: 'Server/TimeAndWeather/BPR_WeatherProviderSystem.c',
    folder: 'Server/TimeAndWeather',
    status: 'modified',
    description: 'System Weather Provider (Mode 1): loads initial weather state and activates TemperatureManager simulation.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
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
`
  },
      {
    id: 'config_climate_profile',
    name: 'BPR_ClimateProfile.c',
    path: 'Configs/BPR_ClimateProfile.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Climate profile container: holds 12-month min/max values and BPR_EClimateZone enum with numeric ID conversion (1-6).',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClimateProfile.c
// Author: Indy & AI Assistant
// Description: Unified data container class for 12-month min/max climate profiles.
//              Holds profile name, origin source, climate zone enum, and monthly
//              temperature arrays.
// ============================================================================

enum BPR_EClimateZone
{
	CONTINENTAL,     // Central / Eastern Europe (Prague, Chernarus, Livonia) - warm summers, cold winters
	OCEANIC,         // Maritime / Coastal (Everon, Arland, Western Europe) - mild, wet, windy
	MEDITERRANEAN,   // Southern Europe (Malden, Altis, Stratis) - hot dry summers, mild winters
	ARID,            // Desert / Steppe (Takistan, Anizay) - extreme heat, dry air, cold nights
	TROPICAL,        // Equatorial / Jungle (Tanoa, Lingor) - hot, humid, year-round convective rains
	SUBARCTIC        // Far North (Namalsk) - freezing cold winters, short cool summers
};

class BPR_ClimateProfile
{
	string m_sProfileName;
	string m_sSource;
	BPR_EClimateZone m_eClimateZone = BPR_EClimateZone.CONTINENTAL;
	ref array<float> m_aMinTemp = new array<float>();
	ref array<float> m_aMaxTemp = new array<float>();

	//------------------------------------------------------------------------------------------------
	//! Converts BPR_EClimateZone enum to human-readable string
	static string ClimateZoneToString(BPR_EClimateZone eZone)
	{
		switch (eZone)
		{
			case BPR_EClimateZone.CONTINENTAL:
				return "Continental";
			case BPR_EClimateZone.OCEANIC:
				return "Oceanic";
			case BPR_EClimateZone.MEDITERRANEAN:
				return "Mediterranean";
			case BPR_EClimateZone.ARID:
				return "Arid";
			case BPR_EClimateZone.TROPICAL:
				return "Tropical";
			case BPR_EClimateZone.SUBARCTIC:
				return "Subarctic";
		}
		return "Continental";
	}

	//------------------------------------------------------------------------------------------------
	//! Converts string to BPR_EClimateZone enum
	static BPR_EClimateZone StringToClimateZone(string sZone)
	{
		string sLower = sZone;
		sLower.ToLower();

		if (sLower.Contains("ocean") || sLower.Contains("maritim"))
			return BPR_EClimateZone.OCEANIC;
		if (sLower.Contains("mediterran"))
			return BPR_EClimateZone.MEDITERRANEAN;
		if (sLower.Contains("arid") || sLower.Contains("desert") || sLower.Contains("wueste"))
			return BPR_EClimateZone.ARID;
		if (sLower.Contains("tropic") || sLower.Contains("jungle") || sLower.Contains("equator"))
			return BPR_EClimateZone.TROPICAL;
		if (sLower.Contains("subarctic") || sLower.Contains("arctic") || sLower.Contains("polar"))
			return BPR_EClimateZone.SUBARCTIC;

		return BPR_EClimateZone.CONTINENTAL;
	}

	//------------------------------------------------------------------------------------------------
	//! Converts numeric ID (1-6) to BPR_EClimateZone enum
	static BPR_EClimateZone IntToClimateZone(int iZoneID)
	{
		switch (iZoneID)
		{
			case 1:
				return BPR_EClimateZone.CONTINENTAL;
			case 2:
				return BPR_EClimateZone.OCEANIC;
			case 3:
				return BPR_EClimateZone.MEDITERRANEAN;
			case 4:
				return BPR_EClimateZone.ARID;
			case 5:
				return BPR_EClimateZone.TROPICAL;
			case 6:
				return BPR_EClimateZone.SUBARCTIC;
		}
		return BPR_EClimateZone.CONTINENTAL;
	}

	//------------------------------------------------------------------------------------------------
	//! Converts BPR_EClimateZone enum to numeric ID (1-6)
	static int ClimateZoneToInt(BPR_EClimateZone eZone)
	{
		switch (eZone)
		{
			case BPR_EClimateZone.CONTINENTAL:
				return 1;
			case BPR_EClimateZone.OCEANIC:
				return 2;
			case BPR_EClimateZone.MEDITERRANEAN:
				return 3;
			case BPR_EClimateZone.ARID:
				return 4;
			case BPR_EClimateZone.TROPICAL:
				return 5;
			case BPR_EClimateZone.SUBARCTIC:
				return 6;
		}
		return 1;
	}
};
`
  },
    {
    id: 'server_validate_climate_table',
    name: 'BPR_ValidateClimateTable.c',
    path: 'Utilities/Server/BPR_ValidateClimateTable.c',
    folder: 'Utilities/Server',
    status: 'new',
    description: 'Server utility class for validating and sanitizing 12-month climate tables.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ValidateClimateTable.c
// Author: Indy & AI Assistant
// Description: Server utility class for validating and sanitizing climate tables (Caller: ValClimTab).
//              Ensures exactly 12 monthly values, verifies Min <= Max (with auto-swap),
//              and checks physical temperature limits (-70.0°C to +65.0°C).
// ============================================================================

class BPR_ValidateClimateTable
{
	const static string CALLER_ID = "ValClimTab";

	const static float MIN_ALLOWED_TEMP = -70.0;
	const static float MAX_ALLOWED_TEMP = 65.0;

	//------------------------------------------------------------------------------------------------
	//! Validates a complete BPR_ClimateProfile data object
	static bool ValidateProfile(BPR_ClimateProfile pProfile)
	{
		if (!pProfile)
		{
			DebugLog.Err(CALLER_ID, "Validation failed: BPR_ClimateProfile is null!");
			return false;
		}

		string sLabel = pProfile.m_sProfileName;
		if (sLabel == "")
			sLabel = pProfile.m_sSource;

		return ValidateTable(pProfile.m_aMinTemp, pProfile.m_aMaxTemp, sLabel);
	}

	//------------------------------------------------------------------------------------------------
	//! Validates and sanitizes two 12-month float arrays (Min and Max)
	static bool ValidateTable(array<float> aMin, array<float> aMax, string sProfileName = "")
	{
		if (!aMin || !aMax)
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for '%1': One or both temperature arrays are null!", sProfileName));
			return false;
		}

		int iCountMin = aMin.Count();
		int iCountMax = aMax.Count();

		if (iCountMin != 12 || iCountMax != 12)
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for '%1': Incomplete month count (Min: %2, Max: %3; Expected: 12).", sProfileName, iCountMin, iCountMax));
			return false;
		}

		bool bHasRepairs = false;

		for (int i = 0; i < 12; i++)
		{
			float fMin = aMin[i];
			float fMax = aMax[i];

			// Auto-correct inverted min/max
			if (fMin > fMax)
			{
				DebugLog.Warn(CALLER_ID, string.Format("Month index %1 in '%2': Min (%3°C) > Max (%4°C). Values swapped automatically.", i + 1, sProfileName, fMin, fMax));
				aMin[i] = fMax;
				aMax[i] = fMin;
				fMin = aMin[i];
				fMax = aMax[i];
				bHasRepairs = true;
			}

			// Sanity check physical bounds
			if (fMin < MIN_ALLOWED_TEMP || fMax > MAX_ALLOWED_TEMP)
			{
				DebugLog.Err(CALLER_ID, string.Format("Month index %1 in '%2': Temperature out of realistic bounds (%3°C to %4°C). Limits: %5°C..%6°C.", i + 1, sProfileName, fMin, fMax, MIN_ALLOWED_TEMP, MAX_ALLOWED_TEMP));
				return false;
			}
		}

		if (bHasRepairs)
		{
			DebugLog.Info(CALLER_ID, string.Format("Climate table '%1' validated with automatic corrections.", sProfileName));
		}

		return true;
	}
};
`
  },
      {
    id: 'config_climate_database',
    name: 'BPR_ClimateDatabase.c',
    path: 'Configs/BPR_ClimateDatabase.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Tier 2 of climate cascade: maps terrain to climate profile and sets explicit BPR_EClimateZone based on map list.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClimateDatabase.c
// Author: Indy & AI Assistant
// Description: Tier 2 of the climate cascade (Caller: ClimDB).
//              Maintains map lists for distinct climate zones, checks whether
//              the active map is mapped, builds the corresponding 12-month
//              BPR_ClimateProfile with its associated BPR_EClimateZone,
//              validates via BPR_ValidateClimateTable, or returns null if
//              unknown (signaling cascade to proceed).
// ============================================================================

class BPR_ClimateDatabase
{
	const static string CALLER_ID = "ClimDB";

	//------------------------------------------------------------------------------------------------
	// Map Zone Arrays (Map names must be in lowercase)
	//------------------------------------------------------------------------------------------------
	protected static ref array<string> s_aOceanicMaps = {
		"eden",
		"everon",
		"azores",
		"arland",
		"gogland"
	};

	protected static ref array<string> s_aContinentalMaps = {
		"chernarus",
		"livonia",
		"namalsk",
		"ruha"
	};

	protected static ref array<string> s_aMediterraneanMaps = {
		"malden",
		"altis",
		"stratis",
		"kolgujev"
	};

	protected static ref array<string> s_aAridMaps = {
		"anizay",
		"takistan",
		"fallujah",
		"kunar",
		"reshmaan",
		"alrayak"
	};

	protected static ref array<string> s_aTropicalMaps = {
		"tanoa",
		"lingor",
		"sahrani",
		"porto"
	};

	//------------------------------------------------------------------------------------------------
	//! Looks up the climate profile for the given map name (or queries active map if omitted).
	//! Returns validated BPR_ClimateProfile if found, or null if map is not in the database.
	static BPR_ClimateProfile GetProfileForMap(string sMapName = "")
	{
		if (sMapName == "")
		{
			bool bFoundMap = BPR_MapUtility.GetMapName(sMapName);
			if (!bFoundMap || sMapName == "")
			{
				DebugLog.Warn(CALLER_ID, "No map name provided and could not be detected via BPR_MapUtility.");
				return null;
			}
		}

		string sLowerMap = sMapName;
		sLowerMap.ToLower();

		ref array<float> aMin;
		ref array<float> aMax;
		string sZoneName = "";
		BPR_EClimateZone eZone = BPR_EClimateZone.CONTINENTAL;

		// 1. Oceanic / Maritime
		if (s_aOceanicMaps.Contains(sLowerMap))
		{
			sZoneName = "Oceanic";
			eZone = BPR_EClimateZone.OCEANIC;
			aMin = {11.5, 11.0, 11.8, 12.5, 14.2, 16.5, 18.5, 19.5, 18.8, 16.5, 14.2, 12.8};
			aMax = {16.8, 16.5, 17.2, 18.0, 20.0, 22.5, 25.2, 26.5, 25.5, 22.8, 19.8, 17.9};
		}
		// 2. Continental (Central / Eastern Europe)
		else if (s_aContinentalMaps.Contains(sLowerMap))
		{
			sZoneName = "Continental";
			eZone = BPR_EClimateZone.CONTINENTAL;
			aMin = {-4.5, -3.8, 0.2, 4.8, 9.5, 12.8, 14.8, 14.2, 10.1, 5.5, 1.2, -2.8};
			aMax = {1.2, 2.5, 7.8, 14.2, 19.5, 22.8, 25.0, 24.5, 19.2, 13.0, 6.8, 2.2};
		}
		// 3. Mediterranean
		else if (s_aMediterraneanMaps.Contains(sLowerMap))
		{
			sZoneName = "Mediterranean";
			eZone = BPR_EClimateZone.MEDITERRANEAN;
			aMin = {8.5, 8.8, 10.2, 12.5, 16.0, 20.2, 23.0, 23.5, 20.5, 16.8, 13.0, 10.0};
			aMax = {14.2, 14.8, 16.8, 19.8, 24.2, 29.0, 32.2, 32.5, 28.8, 24.0, 19.2, 15.5};
		}
		// 4. Arid / Desert
		else if (s_aAridMaps.Contains(sLowerMap))
		{
			sZoneName = "Arid";
			eZone = BPR_EClimateZone.ARID;
			aMin = {2.0, 4.5, 9.8, 15.5, 21.0, 25.5, 28.0, 26.8, 21.5, 15.0, 8.5, 3.5};
			aMax = {13.5, 16.8, 22.5, 29.0, 35.5, 40.5, 42.8, 41.5, 36.8, 29.5, 21.0, 15.0};
		}
		// 5. Tropical / Subtropical
		else if (s_aTropicalMaps.Contains(sLowerMap))
		{
			sZoneName = "Tropical";
			eZone = BPR_EClimateZone.TROPICAL;
			aMin = {22.0, 22.2, 22.5, 23.0, 23.2, 22.8, 22.0, 21.8, 22.0, 22.5, 22.8, 22.2};
			aMax = {29.5, 29.8, 30.2, 30.5, 30.0, 29.2, 28.5, 28.5, 29.0, 29.5, 29.8, 29.5};
		}
		else
		{
			DebugLog.Info(CALLER_ID, string.Format("Map '%1' is not registered in Climate Database. Proceeding to next cascade tier.", sMapName));
			return null;
		}

		// Build climate profile
		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = string.Format("%1 (%2)", sMapName, sZoneName);
		pProfile.m_sSource = "ZoneDatabase:" + sZoneName;
		pProfile.m_eClimateZone = eZone;
		pProfile.m_aMinTemp.Copy(aMin);
		pProfile.m_aMaxTemp.Copy(aMax);

		// Validate climate table
		if (!BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Err(CALLER_ID, string.Format("Internal validation failed for zone '%1'. Profile rejected.", sZoneName));
			return null;
		}

		DebugLog.Info(CALLER_ID, string.Format("Map '%1' matched zone '%2' (%3). Climate profile generated successfully.",
			sMapName, sZoneName, BPR_ClimateProfile.ClimateZoneToString(eZone)));
		return pProfile;
	}
};
`
  },
      {
    id: 'server_coordinates_climate_generator',
    name: 'BPR_CoordinatesClimateGenerator.c',
    path: 'Server/TimeAndWeather/Utilities/BPR_CoordinatesClimateGenerator.c',
    folder: 'Server/TimeAndWeather/Utilities',
    status: 'modified',
    description: 'Tier 3 of climate cascade: generates climate profile from coordinates and derives BPR_EClimateZone mathematically.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_CoordinatesClimateGenerator.c
// Author: Indy & AI Assistant
// Description: Tier 3 of the climate cascade (Caller: CordClimG).
//              Generates a full 12-month climate profile based on geographical
//              coordinates (latitude and longitude) and derives the appropriate
//              BPR_EClimateZone mathematically.
//              Uses climatological insolation, seasonal amplitude curves,
//              hemisphere phase shifting, and standard diurnal spread.
//              Validates the output profile via BPR_ValidateClimateTable.
// ============================================================================

class BPR_CoordinatesClimateGenerator
{
	const static string CALLER_ID = "CordClimG";

	//------------------------------------------------------------------------------------------------
	//! Generates a 12-month climate profile for the given coordinates (or retrieves original terrain coordinates if omitted).
	//! Returns a validated BPR_ClimateProfile object.
	static BPR_ClimateProfile GenerateProfile(float fInLat = 999.0, float fInLon = 999.0)
	{
		float fLatitude = fInLat;
		float fLongitude = fInLon;
		string sSource = "";
		string sMapName = "";

		// If coordinates not provided, fetch original terrain coordinates from MapUtility
		if (fLatitude == 999.0 || fLongitude == 999.0)
		{
			BPR_MapUtility.GetOriginalCoordinates(fLatitude, fLongitude, sSource);
		}
		else
		{
			sSource = string.Format("CustomCoordinates (%1, %2)", fLatitude, fLongitude);
		}

		BPR_MapUtility.GetMapName(sMapName);
		if (sMapName == "")
			sMapName = "UnknownTerrain";

		// Clamp latitude to habitable geographical bounds (-85 to +85)
		float fClampedLat = Math.Clamp(fLatitude, -85.0, 85.0);
		float fAbsLat = Math.AbsFloat(fClampedLat);
		float fLatRad = fAbsLat * Math.DEG2RAD;

		// 1. Annual Mean Base Temperature (Equator ~27°C, Polar ~ -22°C)
		float fBaseTemp = (27.5 * Math.Cos(fLatRad)) - (16.0 * (1.0 - Math.Cos(fLatRad)));

		// 2. Seasonal Temperature Amplitude (Tropics ~1.5°C swing, Sub-arctic ~18°C swing)
		float fSeasonAmplitude = 1.5 + (18.0 * Math.Sin(fLatRad));

		// 3. Diurnal Min-to-Max Baseline Spread (~6.0°C to 10.0°C depending on latitude)
		float fDiurnalSpread = 6.0 + (4.0 * Math.Cos(fLatRad));
		float fHalfSpread = fDiurnalSpread * 0.5;

		// 4. Hemisphere check: Northern peaks in July (month 7), Southern peaks in January (month 1)
		bool bIsNorthern = (fClampedLat >= 0.0);
		int iPeakMonth = 7;
		if (!bIsNorthern)
			iPeakMonth = 1;

		// 5. Determine Climate Zone based on geographical coordinates and seasonal amplitude
		BPR_EClimateZone eZone = CalculateClimateZone(fClampedLat, fLongitude, fSeasonAmplitude);
		string sZoneName = BPR_ClimateProfile.ClimateZoneToString(eZone);

		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = string.Format("%1 (Lat: %2, Lon: %3 | %4)", sMapName, fLatitude, fLongitude, sZoneName);
		pProfile.m_sSource = "GeneratedCoordinates:" + sSource;
		pProfile.m_eClimateZone = eZone;

		// 6. Calculate 12 monthly Min/Max values
		for (int iMonth = 1; iMonth <= 12; iMonth++)
		{
			// Angular distance from summer peak month (in radians)
			float fMonthOffset = (iMonth - iPeakMonth);
			float fAngleRad = fMonthOffset * (Math.PI / 6.0); // 30 degrees (pi/6) per month

			// Cosine wave: +1.0 at peak summer, -1.0 at winter minimum
			float fSeasonalFactor = Math.Cos(fAngleRad);
			float fMonthlyMean = fBaseTemp + (fSeasonAmplitude * fSeasonalFactor);

			// Round to 1 decimal place
			float fMin = Math.Round((fMonthlyMean - fHalfSpread) * 10.0) / 10.0;
			float fMax = Math.Round((fMonthlyMean + fHalfSpread) * 10.0) / 10.0;

			pProfile.m_aMinTemp.Insert(fMin);
			pProfile.m_aMaxTemp.Insert(fMax);
		}

		// 7. Final verification via centralized validator
		if (!BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for generated profile of '%1'.", sMapName));
			return null;
		}

		DebugLog.Info(CALLER_ID, string.Format("Climate profile generated for '%1' (Coords: %2, %3 | Zone: %4 | Jan: %5..%6°C | Jul: %7..%8°C).",
			sMapName, fLatitude, fLongitude, sZoneName,
			pProfile.m_aMinTemp[0], pProfile.m_aMaxTemp[0],
			pProfile.m_aMinTemp[6], pProfile.m_aMaxTemp[6]));

		return pProfile;
	}

	//------------------------------------------------------------------------------------------------
	//! Derives BPR_EClimateZone from latitude, longitude, and seasonal temperature amplitude
	static BPR_EClimateZone CalculateClimateZone(float fLat, float fLon, float fSeasonAmplitude)
	{
		float fAbsLat = Math.AbsFloat(Math.Clamp(fLat, -85.0, 85.0));

		// Polar / Subarctic
		if (fAbsLat >= 60.0)
			return BPR_EClimateZone.SUBARCTIC;

		// Equatorial / Tropical (Tropics of Cancer and Capricorn: ~23.5°)
		if (fAbsLat < 23.5)
			return BPR_EClimateZone.TROPICAL;

		// Subtropical / Mediterranean / Arid (23.5° to 35.0°)
		if (fAbsLat < 35.0)
		{
			// Arid/Desert latitudes (e.g. Sahara, Middle East: Lon 10 to 65 E in Northern hemisphere)
			if (fLat > 0 && fLon >= 10.0 && fLon <= 65.0)
				return BPR_EClimateZone.ARID;

			return BPR_EClimateZone.MEDITERRANEAN;
		}

		// Temperate Belt (35.0° to 60.0°)
		// In Europe/Atlantic: Western coastlines/islands (Lon -25° to +3°) have an Oceanic/Maritime climate
		// Continental landmasses (Lon > 3.0° or high seasonal amplitude > 10.0°C) have a Continental climate
		if (fLon >= -25.0 && fLon <= 3.0 && fSeasonAmplitude < 14.0)
			return BPR_EClimateZone.OCEANIC;

		return BPR_EClimateZone.CONTINENTAL;
	}
};
`
  },
      {
    id: 'config_climate_fallback',
    name: 'BPR_ClimateFallback.c',
    path: 'Configs/BPR_ClimateFallback.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Tier 4 of climate cascade: base fallback climate profile for Bohemia HQ in Prague (Continental).',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClimateFallback.c
// Author: Indy & AI Assistant
// Description: Tier 4 of the climate cascade (Caller: ClimFall).
//              Provides the unconditional, guaranteed base climate profile
//              for the Bohemia Interactive HQ in Prague (50.0755° N, 14.4378° E).
//              Explicitly assigned to BPR_EClimateZone.CONTINENTAL.
//              Used as the rock-solid ultimate fallback if all prior tiers
//              (Custom JSON, Climate Database, Coordinates Generator) fail.
// ============================================================================

class BPR_ClimateFallback
{
	const static string CALLER_ID = "ClimFallb";

	//------------------------------------------------------------------------------------------------
	// 12-Month Climatological Average for Prague, Czech Republic (Bohemia Interactive HQ)
	// Month order: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
	//------------------------------------------------------------------------------------------------
	protected static ref array<float> s_aFallbackMin = {
		-3.0, -2.5, 0.5, 4.5, 9.0, 12.5, 14.5, 14.0, 10.0, 5.5, 1.5, -1.8
	};

	protected static ref array<float> s_aFallbackMax = {
		2.0, 3.8, 8.5, 14.5, 19.5, 23.0, 25.5, 25.0, 20.0, 13.5, 7.0, 3.0
	};

	//------------------------------------------------------------------------------------------------
	//! Generates and returns the guaranteed base climate profile for Bohemia HQ (Prague).
	//! This profile is pre-validated and guaranteed to never return null.
	static BPR_ClimateProfile GetFallbackProfile()
	{
		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = BPR_MapUtility.DEFAULT_FALLBACK_NAME;
		pProfile.m_sSource = "BaseFallback:BisHQ";
		pProfile.m_eClimateZone = BPR_EClimateZone.CONTINENTAL;

		pProfile.m_aMinTemp.Copy(s_aFallbackMin);
		pProfile.m_aMaxTemp.Copy(s_aFallbackMax);

		// Sanity check via validator
		if (!BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Err(CALLER_ID, "Critical error: Fallback climate profile failed internal validation!");
		}

		DebugLog.Info(CALLER_ID, "Base climate fallback loaded (Bohemia Interactive HQ, Prague [Continental]: Jan -3..2°C | Jul 14.5..25.5°C).");
		return pProfile;
	}
};
`
  },
  {
    id: 'server_wind_dynamics_processor',
    name: 'BPR_WindDynamicsProcessor.c',
    path: 'Server/TimeAndWeather/Utilities/BPR_WindDynamicsProcessor.c',
    folder: 'Server/TimeAndWeather/Utilities',
    status: 'new',
    description: 'Wind dynamics processor: smooth speed/direction transitions (sound pop protection), micro-turbulence, realistic gust ramp-up/decay curves, and natural lulls.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
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
`
  },
  {
    id: 'server_fog_dynamics_processor',
    name: 'BPR_FogDynamicsProcessor.c',
    path: 'Server/TimeAndWeather/Utilities/BPR_FogDynamicsProcessor.c',
    folder: 'Server/TimeAndWeather/Utilities',
    status: 'new',
    description: 'Fog dynamics processor: hibernation mode (0% CPU when clear), dynamic transition durations based on density deltas and wind dissipation, and atmospheric breathing (wabern).',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-27',
    content: `// ============================================================================
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
`
  },
            {
    id: 'server_temperature_manager',
    name: 'BPR_TemperatureManager.c',
    path: 'Server/TimeAndWeather/BPR_TemperatureManager.c',
    folder: 'Server/TimeAndWeather',
    status: 'modified',
    description: 'Central temperature manager: hybrid weather handling (Mode 1 engine polling + Mode 2/3/4 push notifications) and radiational night cooling.',
    createdAt: '2026-09-27',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_TemperatureManager.c
// Author: Indy & AI Assistant
// Description: Central Server Temperature Manager (Caller: TempMgr).
//              - Resolves the 4-tier Climate Profile Cascade during Loading phase:
//                1. Custom JSON (BPR_CustomClimate)
//                2. Terrains Database (BPR_ClimateDatabase)
//                3. Coordinates Insolation Generator (BPR_CoordinatesClimateGenerator)
//                4. Safe Fallback Profile (BPR_ClimateFallback)
//              - Cycle 1 (System, Simple & Fallback):
//                * Smooth monthly min/max interpolation (seamless day-by-day transitions).
//                * Multi-day synoptic weather anomalies (high/low pressure systems lasting 2-5 days, ±4°C).
//                * 24-hour diurnal solar curve (minimum at 05:30, maximum at 14:30).
//                * Realistic weather damping (clouds, rain cooling, fog).
//              - Cycle 2 (Open-Meteo):
//                * Checks for immediate data availability on startup.
//                * Glides smoothly between 15-minute real-world measurement intervals.
//                * Automatic watchdog and seamless fallback to Cycle 1 if API data is delayed or lost.
//              - Smooth Slew-Rate Limiter (prevents sudden temperature jumps).
// ============================================================================

class BPR_TemperatureManager
{
	const static string CALLER_ID = "TempMgr";
	const static int UPDATE_INTERVAL_MS = 60000;              // Update cycle every 60 seconds (1 minute)
	const static float MAX_TEMP_SLEW_PER_MINUTE = 0.20;       // Max temperature change of 0.2°C per minute

	protected static ref BPR_TemperatureManager s_pInstance;

	// Climate profile and cascade
	protected ref BPR_ClimateProfile m_pActiveClimateProfile;
	protected BPR_EClimateZone m_eActiveClimateZone = BPR_EClimateZone.CONTINENTAL;
	protected int m_iResolvedCascadeTier = 0;
	protected string m_sProfileSource = "";

	// Operational state
	protected bool m_bIsInitialized = false;
	protected int m_iWeatherMode = 2;                         // 1=System, 2=Simple, 3=OpenMeteoReal, 4=OpenMeteoCustom
	protected int m_iActiveCycle = 1;                         // 1=Climate/Synoptic, 2=OpenMeteo
	protected bool m_bIsFallbackActive = false;
	protected string m_sCurrentWeatherState = "Clear";

	// Temperature state
	protected float m_fCurrentTemperature = 15.0;             // Active physical air temperature (°C)
	protected float m_fTargetTemperature = 15.0;              // Target temperature for smooth interpolation (°C)
	protected float m_fDayMinTemperature = 10.0;              // Current day interpolated min temperature
	protected float m_fDayMaxTemperature = 20.0;              // Current day interpolated max temperature
	protected float m_fLastReplicatedTemperature = -999.0;    // Last temperature synced to NetworkManager (°C)
	protected const float REPLICATION_TEMPERATURE_THRESHOLD = 0.1; // Delta threshold (°C) to trigger network replication

	// Multi-day synoptic anomaly (High/Low pressure patterns lasting 2-5 days)
	protected float m_fSynopticAnomaly = 0.0;                 // Current active anomaly offset (°C)
	protected float m_fTargetSynopticAnomaly = 0.0;           // Target anomaly offset for next period
	protected int m_iAnomalyDaysRemaining = 0;                // Days remaining for current synoptic pattern
	protected int m_iLastEvaluatedDay = -1;                   // Tracks in-game day changes

	// Open-Meteo tracking
	protected int m_iLastOMIntervalIndex = -1;
	protected float m_fOMIntervalStartTemp = 15.0;
	protected float m_fOMIntervalTargetTemp = 15.0;

	// Events
	protected ref ScriptInvoker m_OnTemperatureUpdated;

	// Time Manager entity reference
	protected TimeAndWeatherManagerEntity m_pTimeManager;

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_TemperatureManager()
	{
		m_OnTemperatureUpdated = new ScriptInvoker();
	}

	//------------------------------------------------------------------------------------------------
	//! Singleton instance getter
	static BPR_TemperatureManager GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_TemperatureManager();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! Event invoker: (float fCurrentTemp, int iCycle, bool bFallbackActive)
	ScriptInvoker GetOnTemperatureUpdated()
	{
		return m_OnTemperatureUpdated;
	}

	//------------------------------------------------------------------------------------------------
	//! Pre-resolves the 4-tier climate cascade and prepares profile in memory (called by LoadingManager, does not start simulation)
	void ResolveClimateCascade()
	{
		if (m_pActiveClimateProfile)
			return;

		m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		// Read server config for WeatherMode
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (pConfig)
			m_iWeatherMode = pConfig.iWeatherMode;
		else
			m_iWeatherMode = 2;

		// 1. Resolve Climate Profile Cascade (Tiers 1 to 4)
		ResolveClimateProfileInternal();

		// 2. Roll initial multi-day synoptic anomaly
		RollNewSynopticAnomaly();
		m_fSynopticAnomaly = m_fTargetSynopticAnomaly;

		DebugLog.Info(CALLER_ID, "Climate cascade successfully prepared in LoadingManager (cycles idle until weather start).");
	}

	//------------------------------------------------------------------------------------------------
	//! Starts the active temperature simulation and tick queue with initial weather state (called by Weather Providers)
	void StartSimulation(string sInitialWeatherState = "Clear")
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		// Ensure climate cascade is resolved
		if (!m_pActiveClimateProfile)
			ResolveClimateCascade();

		if (sInitialWeatherState != "")
			m_sCurrentWeatherState = sInitialWeatherState;

		// Determine active cycle based on WeatherMode & Open-Meteo readiness
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			// Check if Open-Meteo already has valid data available
			if (BPR_FetchOpenMeteoData.HasValidData())
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "Open-Meteo data already available. Starting directly in Cycle 2.");
			}
			else
			{
				// Open-Meteo not ready yet -> start in Cycle 1 as fallback and register listener
				m_iActiveCycle = 1;
				m_bIsFallbackActive = true;
				DebugLog.Info(CALLER_ID, "Open-Meteo data pending. Starting temporarily in Cycle 1 (Fallback).");

				BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
				if (pFetchService)
					pFetchService.GetOnWeatherDataUpdated().Insert(OnOpenMeteoDataReceived);
			}
		}
		else
		{
			m_iActiveCycle = 1;
			m_bIsFallbackActive = false;
			DebugLog.Info(CALLER_ID, string.Format("Starting in Cycle 1 (Climate/Synoptic) for weather mode %1.", m_iWeatherMode));
		}

		// In Mode 1 (System Weather), query engine weather state immediately if available
		if (m_iWeatherMode == 1)
		{
			PollEngineWeatherState();
		}

		// Calculate initial start temperature based on initial weather state
		CalculateImmediateStartTemperature();

		// Start periodic update loop
		GetGame().GetCallqueue().Remove(OnUpdateTick);
		GetGame().GetCallqueue().CallLater(OnUpdateTick, UPDATE_INTERVAL_MS, true);

		DebugLog.Info(CALLER_ID, string.Format("TemperatureManager started with weather '%1' -> initial temperature: %2°C (Cycle %3).",
			m_sCurrentWeatherState, Math.Round(m_fCurrentTemperature * 10.0) / 10.0, m_iActiveCycle));
	}

	//------------------------------------------------------------------------------------------------
	//! Legacy/Default initializer: resolves cascade and starts simulation with "Clear" weather
	void Init()
	{
		ResolveClimateCascade();
		StartSimulation("Clear");
	}

	// ===============================================================================================
	// CLIMATE PROFILE CASCADE RESOLUTION (Tiers 1 - 4)
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Resolves the 4-tier climate cascade in strict order
	protected void ResolveClimateProfileInternal()
	{
		// Tier 1: Custom Climate JSON file
		m_pActiveClimateProfile = BPR_CustomClimate.TryGetProfile();
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 1;
			m_sProfileSource = string.Format("Tier 1: Custom JSON (%1)", m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 2: Terrains Climate Database
		string sMapName = "";
		BPR_MapUtility.GetMapName(sMapName);
		m_pActiveClimateProfile = BPR_ClimateDatabase.GetProfileForMap(sMapName);
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 2;
			m_sProfileSource = string.Format("Tier 2: Map Database for '%1' (%2)", sMapName, m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 3: Coordinates Solar Insolation Generator
		float fLatitude = 999.0;
		float fLongitude = 999.0;
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (pConfig && pConfig.sCoordinates != "")
		{
			BPR_MapUtility.ParseCoordinates(pConfig.sCoordinates, fLatitude, fLongitude);
		}

		m_pActiveClimateProfile = BPR_CoordinatesClimateGenerator.GenerateProfile(fLatitude, fLongitude);
		if (m_pActiveClimateProfile)
		{
			m_iResolvedCascadeTier = 3;
			m_sProfileSource = string.Format("Tier 3: Coordinates Generator (%1)", m_pActiveClimateProfile.m_sProfileName);
			LogCascadeResolution();
			return;
		}

		// Tier 4: Safe Hardcoded Fallback Profile
		m_pActiveClimateProfile = BPR_ClimateFallback.GetFallbackProfile();
		m_iResolvedCascadeTier = 4;
		m_sProfileSource = "Tier 4: Safety Fallback (Bohemia Interactive HQ, Prague)";
		LogCascadeResolution();
	}

	//------------------------------------------------------------------------------------------------
	//! Logs formatted cascade resolution info
	protected void LogCascadeResolution()
	{
		if (!m_pActiveClimateProfile)
			return;

		m_eActiveClimateZone = m_pActiveClimateProfile.m_eClimateZone;
		string sZoneName = BPR_ClimateProfile.ClimateZoneToString(m_eActiveClimateZone);

		DebugLog.Info(CALLER_ID, string.Format("Climate profile successfully resolved: %1 | Zone: %2", m_sProfileSource, sZoneName));
		DebugLog.Info(CALLER_ID, string.Format("Climate range Jan: %1..%2°C | Jul: %3..%4°C",
			Math.Round(m_pActiveClimateProfile.m_aMinTemp[0]), Math.Round(m_pActiveClimateProfile.m_aMaxTemp[0]),
			Math.Round(m_pActiveClimateProfile.m_aMinTemp[6]), Math.Round(m_pActiveClimateProfile.m_aMaxTemp[6])));
	}

	// ===============================================================================================
	// CORE TEMPERATURE CALCULATION
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates instantaneous temperature at mission start to prevent cold/hot step jumps
	protected void CalculateImmediateStartTemperature()
	{
		if (m_iActiveCycle == 2 && BPR_FetchOpenMeteoData.HasValidData())
		{
			float fTargetTemp = CalculateCycle2Target();
			m_fCurrentTemperature = fTargetTemp;
			m_fTargetTemperature = fTargetTemp;
		}
		else
		{
			float fTargetTemp = CalculateCycle1Target();
			m_fCurrentTemperature = fTargetTemp;
			m_fTargetTemperature = fTargetTemp;
		}

		// Replicate initial temperature to NetworkManager for immediate JIP availability
		SyncNetworkTemperature(true);
	}

	//------------------------------------------------------------------------------------------------
	//! Replicates base temperature to the global network manager if delta threshold is reached or forced
	protected void SyncNetworkTemperature(bool bForceSync = false)
	{
		if (!bForceSync && Math.AbsFloat(m_fCurrentTemperature - m_fLastReplicatedTemperature) < REPLICATION_TEMPERATURE_THRESHOLD)
			return;

		m_fLastReplicatedTemperature = m_fCurrentTemperature;

		BPR_NetworkManagerComponent pNetworkManager = BPR_NetworkManagerComponent.GetInstance();
		if (pNetworkManager)
			pNetworkManager.SetBaseTemperature(m_fCurrentTemperature);
	}

	//------------------------------------------------------------------------------------------------
	//! Periodic tick handler executed every 60 seconds
	protected void OnUpdateTick()
	{
		// 1. Check for day rollover to manage multi-day synoptic anomalies
		int iCurrentYear = 2026;
		int iCurrentMonth = 6;
		int iCurrentDay = 15;
		int iCurrentHour = 12;
		int iCurrentMinute = 0;
		int iCurrentSecond = 0;

		GetInGameDateTime(iCurrentYear, iCurrentMonth, iCurrentDay, iCurrentHour, iCurrentMinute, iCurrentSecond);

		if (m_iLastEvaluatedDay != iCurrentDay)
		{
			OnDayChanged(iCurrentDay);
		}

		// 2. Mode 1: Periodically poll engine weather state if in System Weather Mode
		if (m_iWeatherMode == 1)
		{
			PollEngineWeatherState();
		}

		// 3. Check Open-Meteo watchdog if in mode 3 or 4
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			bool bHasOMData = BPR_FetchOpenMeteoData.HasValidData();
			if (bHasOMData && m_bIsFallbackActive)
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "Open-Meteo data received. Ending fallback and switching to Cycle 2.");
			}
			else if (!bHasOMData && !m_bIsFallbackActive)
			{
				m_iActiveCycle = 1;
				m_bIsFallbackActive = true;
				DebugLog.Warn(CALLER_ID, "Open-Meteo data unavailable. Activating Cycle 1 as fallback.");
			}
		}

		// 4. Compute target temperature for active cycle
		if (m_iActiveCycle == 2 && !m_bIsFallbackActive)
		{
			m_fTargetTemperature = CalculateCycle2Target();
		}
		else
		{
			m_fTargetTemperature = CalculateCycle1Target();
		}

		// 5. Smooth Slew-Rate Limiter (Max 0.20°C per minute)
		float fTempDelta = m_fTargetTemperature - m_fCurrentTemperature;
		float fMaxStep = MAX_TEMP_SLEW_PER_MINUTE;

		if (Math.AbsFloat(fTempDelta) <= fMaxStep)
		{
			m_fCurrentTemperature = m_fTargetTemperature;
		}
		else
		{
			if (fTempDelta > 0.0)
				m_fCurrentTemperature += fMaxStep;
			else
				m_fCurrentTemperature -= fMaxStep;
		}

		// 6. Broadcast to listeners (Survival, UI, Vehicle Systems)
		if (m_OnTemperatureUpdated)
			m_OnTemperatureUpdated.Invoke(m_fCurrentTemperature, m_iActiveCycle, m_bIsFallbackActive);

		// 7. Replicate to NetworkManager for clients and JIP synchronization if delta threshold is exceeded
		SyncNetworkTemperature();
	}

	//------------------------------------------------------------------------------------------------
	//! Polls the active weather state directly from TimeAndWeatherManagerEntity (used in Mode 1: System Weather)
	protected void PollEngineWeatherState()
	{
		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (!m_pTimeManager)
			return;

		WeatherState pWeatherState = m_pTimeManager.GetCurrentWeatherState();
		if (pWeatherState)
		{
			string sEngineWeather = pWeatherState.GetStateName();
			if (sEngineWeather != "" && sEngineWeather != m_sCurrentWeatherState)
			{
				m_sCurrentWeatherState = sEngineWeather;
				DebugLog.Info(CALLER_ID, string.Format("System weather state detected from engine: %1", m_sCurrentWeatherState));
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Callback invoked when Open-Meteo asynchronous data finishes downloading
	protected void OnOpenMeteoDataReceived()
	{
		if (m_iWeatherMode == 3 || m_iWeatherMode == 4)
		{
			if (m_bIsFallbackActive)
			{
				m_iActiveCycle = 2;
				m_bIsFallbackActive = false;
				DebugLog.Info(CALLER_ID, "OnOpenMeteoDataReceived: Fresh API data available -> Cycle 2 activated.");
			}
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Handles day rollover: advances synoptic anomaly countdown or generates new anomaly
	protected void OnDayChanged(int iNewDay)
	{
		m_iLastEvaluatedDay = iNewDay;

		m_iAnomalyDaysRemaining--;
		if (m_iAnomalyDaysRemaining <= 0)
		{
			RollNewSynopticAnomaly();
		}
		else
		{
			// Gently ease towards active target anomaly
			m_fSynopticAnomaly = Math.Lerp(m_fSynopticAnomaly, m_fTargetSynopticAnomaly, 0.5);
		}

		DebugLog.Info(CALLER_ID, string.Format("Day rollover registered (Day %1). Synoptic anomaly: %2°C (Remaining: %3 days).",
			iNewDay, Math.Round(m_fSynopticAnomaly * 10.0) / 10.0, m_iAnomalyDaysRemaining));
	}

	//------------------------------------------------------------------------------------------------
	//! Rolls a new multi-day high/low pressure anomaly (2-5 days, ±4.0°C)
	protected void RollNewSynopticAnomaly()
	{
		m_iAnomalyDaysRemaining = Math.RandomIntInclusive(2, 5);
		m_fTargetSynopticAnomaly = Math.RandomFloatInclusive(-4.0, 4.0);
		m_fSynopticAnomaly = Math.Lerp(m_fSynopticAnomaly, m_fTargetSynopticAnomaly, 0.4);

		string sSystemType = "Normal";
		if (m_fTargetSynopticAnomaly >= 1.5)
			sSystemType = "High Pressure (Warm Phase)";
		else if (m_fTargetSynopticAnomaly <= -1.5)
			sSystemType = "Low Pressure (Cold Phase)";

		DebugLog.Info(CALLER_ID, string.Format("New synoptic weather pattern: %1 (%2°C for %3 days).",
			sSystemType, Math.Round(m_fTargetSynopticAnomaly * 10.0) / 10.0, m_iAnomalyDaysRemaining));
	}

	// ===============================================================================================
	// ZYKLUS 1: KLIMA-TABELLE, SYNOPTIK & TAGESGANGLINIE
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates target temperature for Cycle 1
	protected float CalculateCycle1Target()
	{
		if (!m_pActiveClimateProfile)
			return 15.0;

		int iYear = 2026;
		int iMonth = 6;
		int iDay = 15;
		int iHour = 12;
		int iMinute = 0;
		int iSecond = 0;

		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		// 1. Calculate continuous Daily Min & Max from monthly climate table
		float fInterpolatedMin = 10.0;
		float fInterpolatedMax = 20.0;
		InterpolateMonthlyMinMax(iMonth, iDay, fInterpolatedMin, fInterpolatedMax);

		// 2. Apply multi-day synoptic anomaly (High/Low pressure)
		m_fDayMinTemperature = fInterpolatedMin + m_fSynopticAnomaly;
		m_fDayMaxTemperature = fInterpolatedMax + m_fSynopticAnomaly;

		// 3. Calculate 24-hour diurnal solar curve (Min ~05:30, Max ~14:30)
		float fTimeOfDayHours = iHour + (iMinute / 60.0);
		float fBaseTemp = EvaluateDiurnalCurve(fTimeOfDayHours, m_fDayMinTemperature, m_fDayMaxTemperature);

		// 4. Apply weather dampening (rain cooling, overcast insulation, fog)
		float fWeatherOffset = CalculateWeatherDamping(fTimeOfDayHours, m_sCurrentWeatherState);

		return fBaseTemp + fWeatherOffset;
	}

	//------------------------------------------------------------------------------------------------
	//! Smoothly interpolates daily min/max between months based on the day of the month
	protected void InterpolateMonthlyMinMax(int iMonth, int iDay, out float fOutMin, out float fOutMax)
	{
		fOutMin = 10.0;
		fOutMax = 20.0;

		if (!m_pActiveClimateProfile || m_pActiveClimateProfile.m_aMinTemp.Count() < 12)
			return;

		int iMonthIdx = Math.Clamp(iMonth - 1, 0, 11);

		// The 15th is the exact center of the current month
		if (iDay == 15)
		{
			fOutMin = m_pActiveClimateProfile.m_aMinTemp[iMonthIdx];
			fOutMax = m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx];
			return;
		}

		int iNeighborMonthIdx;
		float fInterpolationFactor;

		if (iDay < 15)
		{
			// Interpolate with previous month
			iNeighborMonthIdx = (iMonthIdx + 11) % 12;
			// Day 1: ~50% towards prev month, Day 15: 0% towards prev month
			fInterpolationFactor = (15.0 - iDay) / 30.0;
			fOutMin = Math.Lerp(m_pActiveClimateProfile.m_aMinTemp[iMonthIdx], m_pActiveClimateProfile.m_aMinTemp[iNeighborMonthIdx], fInterpolationFactor);
			fOutMax = Math.Lerp(m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx], m_pActiveClimateProfile.m_aMaxTemp[iNeighborMonthIdx], fInterpolationFactor);
		}
		else
		{
			// Interpolate with next month
			iNeighborMonthIdx = (iMonthIdx + 1) % 12;
			// Day 15: 0% towards next month, Day 31: ~50% towards next month
			fInterpolationFactor = (iDay - 15.0) / 30.0;
			fOutMin = Math.Lerp(m_pActiveClimateProfile.m_aMinTemp[iMonthIdx], m_pActiveClimateProfile.m_aMinTemp[iNeighborMonthIdx], fInterpolationFactor);
			fOutMax = Math.Lerp(m_pActiveClimateProfile.m_aMaxTemp[iMonthIdx], m_pActiveClimateProfile.m_aMaxTemp[iNeighborMonthIdx], fInterpolationFactor);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Evaluates diurnal solar temperature curve for any hour of the day (0.0 to 24.0)
	//! Daily minimum at ~05:30 (dawn), Daily maximum at ~14:30 (solar afternoon lag)
	protected float EvaluateDiurnalCurve(float fHour, float fMinTemp, float fMaxTemp)
	{
		float fSpread = fMaxTemp - fMinTemp;
		float fNormalizedFactor;

		if (fHour >= 5.5 && fHour <= 14.5)
		{
			// Day warming phase (9 hours from 05:30 to 14:30)
			float fPhase = (fHour - 5.5) / 9.0;
			// Cosine ease from 0.0 to 1.0
			fNormalizedFactor = (1.0 - Math.Cos(fPhase * Math.PI)) * 0.5;
		}
		else
		{
			// Night cooling phase (15 hours from 14:30 to 05:30 next morning)
			float fNightHour = fHour;
			if (fNightHour < 5.5)
				fNightHour += 24.0;

			float fPhase = (fNightHour - 14.5) / 15.0;
			// Cosine ease from 1.0 down to 0.0
			fNormalizedFactor = (1.0 + Math.Cos(fPhase * Math.PI)) * 0.5;
		}

		return fMinTemp + (fSpread * fNormalizedFactor);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates physical weather offsets for clouds, rain, thunder, and fog (Cycle 1 only)
	protected float CalculateWeatherDamping(float fHour, string sWeatherState)
	{
		bool bIsDaytime = (fHour >= 7.0 && fHour <= 19.0);
		float fOffset = 0.0;
		string sLowerState = sWeatherState;
		sLowerState.ToLower();

		// 1. Cloud Cover Base (Solar dampening during day, greenhouse insulation vs. radiative cooling at night)
		if (sLowerState.Contains("overcast") || sLowerState.Contains("overkast"))
		{
			if (bIsDaytime)
				fOffset -= 3.5;
			else
				fOffset += 2.0; // Dense cloud blanket traps infrared heat (mild, prevents frost)
		}
		else if (sLowerState.Contains("broken"))
		{
			if (bIsDaytime)
				fOffset -= 2.5;
			else
				fOffset += 1.0;
		}
		else if (sLowerState.Contains("cloudy"))
		{
			if (bIsDaytime)
				fOffset -= 1.5;
			else
				fOffset += 0.0; // Balanced
		}
		else if (sLowerState.Contains("few"))
		{
			if (bIsDaytime)
				fOffset -= 0.5;
			else
				fOffset -= 1.5; // Mild radiative cooling into space
		}
		else
		{
			// "Clear" / default: maximum solar heating by day (0.0), strong radiative cooling into space at night (-2.5°C -> frost trigger)
			if (!bIsDaytime)
				fOffset -= 2.5;
		}

		// 2. Precipitation / Rain (Evaporative cooling and cold rainfall)
		// Note: "Extreme" and "Rainy" are treated as equal
		if (sLowerState.Contains("extreme") || sLowerState.Contains("rainy"))
		{
			if (bIsDaytime)
				fOffset -= 3.5;
			else
				fOffset -= 2.0;
		}
		else if (sLowerState.Contains("strong"))
		{
			if (bIsDaytime)
				fOffset -= 2.5;
			else
				fOffset -= 1.5;
		}
		else if (sLowerState.Contains("normal"))
		{
			if (bIsDaytime)
				fOffset -= 1.5;
			else
				fOffset -= 1.0;
		}
		else if (sLowerState.Contains("drizzle"))
		{
			fOffset -= 0.5;
		}

		// 3. Thunderstorm Downdrafts (cold falling air currents)
		if (sLowerState.Contains("thunder"))
		{
			fOffset -= 1.0;
		}

		// 4. Fog effect: dampens morning warming
		BPR_FogDynamicsProcessor pFogProcessor = BPR_FogDynamicsProcessor.GetInstance();
		if (pFogProcessor && !pFogProcessor.IsHibernating())
		{
			float fFogDensity = pFogProcessor.GetEffectiveDensity();
			if (bIsDaytime && fHour <= 11.0)
				fOffset -= (1.5 * fFogDensity);
		}

		return fOffset;
	}

	// ===============================================================================================
	// ZYKLUS 2: OPEN-METEO 15-MINUTEN-GLEITER
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Calculates target temperature for Cycle 2 (smooth 15-minute interpolation)
	protected float CalculateCycle2Target()
	{
		int iYear = 2026;
		int iMonth = 6;
		int iDay = 15;
		int iHour = 12;
		int iMinute = 0;
		int iSecond = 0;

		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = (iHour * 4) + (iMinute / 15);
		int iMinuteInInterval = iMinute % 15;
		float fIntervalProgress = (iMinuteInInterval + (iSecond / 60.0)) / 15.0;

		float fCurrentIntervalTemp = 15.0;
		float fNextIntervalTemp = 15.0;

		float fDummyFloat;
		int iDummyInt;

		// Fetch current interval
		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iCurrentIntervalIndex, fCurrentIntervalTemp, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat, iDummyInt, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat))
		{
			return m_fCurrentTemperature;
		}

		// Fetch next interval (wrap to interval 0 of next day if at end)
		int iNextIntervalIndex = iCurrentIntervalIndex + 1;
		if (iNextIntervalIndex >= BPR_FetchOpenMeteoData.GetDataCount())
			iNextIntervalIndex = iCurrentIntervalIndex;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iNextIntervalIndex, fNextIntervalTemp, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat, iDummyInt, fDummyFloat, fDummyFloat, fDummyFloat, fDummyFloat))
		{
			fNextIntervalTemp = fCurrentIntervalTemp;
		}

		// Smooth minute-by-minute glide between 15-minute measurements
		return Math.Lerp(fCurrentIntervalTemp, fNextIntervalTemp, fIntervalProgress);
	}

	// ===============================================================================================
	// UTILITIES & ENGINE TIME
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Retrieves current in-game date and time from TimeAndWeatherManagerEntity
	protected void GetInGameDateTime(out int iYear, out int iMonth, out int iDay, out int iHour, out int iMinute, out int iSecond)
	{
		iYear = 2026;
		iMonth = 6;
		iDay = 15;
		iHour = 12;
		iMinute = 0;
		iSecond = 0;

		if (!m_pTimeManager)
			m_pTimeManager = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID, true);

		if (m_pTimeManager)
		{
			m_pTimeManager.GetDate(iYear, iMonth, iDay);
			m_pTimeManager.GetHoursMinutesSeconds(iHour, iMinute, iSecond);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! External notification from Weather Providers to update current weather state for Cycle 1 damping
	void NotifyWeatherStateChanged(string sWeatherState)
	{
		m_sCurrentWeatherState = sWeatherState;
		DebugLog.Info(CALLER_ID, string.Format("Weather state updated: %1", m_sCurrentWeatherState));
	}

	// ===============================================================================================
	// GETTERS
	// ===============================================================================================

	//! Returns current physical air temperature (°C)
	float GetCurrentTemperature()
	{
		return m_fCurrentTemperature;
	}

	//! Returns active target temperature (°C)
	float GetTargetTemperature()
	{
		return m_fTargetTemperature;
	}

	//! Returns current day's calculated minimum temperature (°C)
	float GetDayMinTemperature()
	{
		return m_fDayMinTemperature;
	}

	//! Returns current day's calculated maximum temperature (°C)
	float GetDayMaxTemperature()
	{
		return m_fDayMaxTemperature;
	}

	//! Returns currently active simulation cycle (1 = Climate/Synoptic, 2 = Open-Meteo)
	int GetActiveCycle()
	{
		return m_iActiveCycle;
	}

	//! Returns whether fallback to Cycle 1 is currently active (when in Open-Meteo mode)
	bool IsFallbackActive()
	{
		return m_bIsFallbackActive;
	}

	//! Returns the active BPR_ClimateProfile
	BPR_ClimateProfile GetActiveClimateProfile()
	{
		return m_pActiveClimateProfile;
	}

	//! Returns the resolved cascade tier (1-4)
	int GetResolvedCascadeTier()
	{
		return m_iResolvedCascadeTier;
	}

	//! Returns the profile source description
	string GetProfileSource()
	{
		return m_sProfileSource;
	}

	//! Returns the active climate zone enum
	BPR_EClimateZone GetActiveClimateZone()
	{
		return m_eActiveClimateZone;
	}

	//! Returns the active climate zone name as string
	string GetActiveClimateZoneName()
	{
		return BPR_ClimateProfile.ClimateZoneToString(m_eActiveClimateZone);
	}

	//! Static helper: Returns active climate zone enum (or CONTINENTAL default if uninitialized)
	static BPR_EClimateZone GetCurrentClimateZone()
	{
		if (!s_pInstance)
			return BPR_EClimateZone.CONTINENTAL;

		return s_pInstance.m_eActiveClimateZone;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance for clean mission restart
	static void Reset()
	{
		if (s_pInstance)
		{
			GetGame().GetCallqueue().Remove(s_pInstance.OnUpdateTick);

			BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
			if (pFetchService)
				pFetchService.GetOnWeatherDataUpdated().Remove(s_pInstance.OnOpenMeteoDataReceived);

			if (s_pInstance.m_OnTemperatureUpdated)
				s_pInstance.m_OnTemperatureUpdated.Clear();

			s_pInstance = null;
		}
	}
};
`
  },
  {
    id: 'config_server_config',
    name: 'BPR_ServerConfig.c',
    path: 'Configs/BPR_ServerConfig.c',
    folder: 'Configs',
    status: 'modified',
    description: 'Server configuration with 0. Random for WeatherTransitions and TransitionTime.',
    createdAt: '2026-09-28',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ServerConfig.c
// Author: Indy & AI Assistant
// Description: Server configuration data structure for Boiling Point Reforger.
//              Holds customizable mission parameters with default values.
// ============================================================================

class BPR_ServerConfig
{
	const static string CALLER_ID = "ServCfg";

	// --- Internal Enforce Script Variables (Strict Hungarian Notation) ---
	string sVersion = "0.0.1";
	ref array<string> aDescription;
	ref array<string> aInfoDate;
	ref array<string> aInfoTime;
	ref array<string> aInfoWeather;
	ref array<string> aInfoAmbient;
	ref array<string> aInfoAdmin;

	int iDateMode = 2;
	string sStartDate = "16.11.2023";
	
	int iTimeMode = 3;
	int iTimezoneUTC = 0;
	bool bSummerTime = false;
	int iCustomHour = 12;

	int iWeatherMode = 1;
	int iStartWeather = 0;
	int iWeatherTransitions = 0;
	int iTransitionTime = 0;
	string sCoordinates = "50.0755, 14.4378";
	
	int iAmbientFactor = 4;
	
	bool bDebugMode = false;

	// ------------------------------------------------------------------------
	// Constructor: Default Header Descriptions
	// ------------------------------------------------------------------------
	void BPR_ServerConfig()
	{
		aDescription = new array<string>();
		aDescription.Insert("--- Boiling Point Reforger SERVER CONFIG Description ---");
		aDescription.Insert("Use this file (or Parametersetup Dialog in Mission) to change the mission parameters.");
		aDescription.Insert("Make changes carefully. Only change values of the variables.");
		aDescription.Insert("Ensure the same data type when making changes. Invalid variables are replaced by default values.");
		aDescription.Insert("Changes to the variable name or the structure result in errors and default values are used.");
		aDescription.Insert("If you encounter problems, delete the file so a new one is created when the mission starts.");
		aDescription.Insert("---------------------------------------");

		aInfoDate = new array<string>();
		aInfoDate.Insert("--- SELECT MISSION DATE ---");
		aInfoDate.Insert("DateMode: 1. Mission date; 2. UTC date; 3. Free date");
		aInfoDate.Insert("StartDate: Enter the date you want to play, day/month/year (Format dd.mm.yyyy).");
		aInfoDate.Insert("---------------------------------------");

		aInfoTime = new array<string>();
		aInfoTime.Insert("--- SELECT MISSION TIME ---");
		aInfoTime.Insert("TimeMode: 1. UTC time; 2. Choose hour of day; 3. Random hour; 4. Maptime (Time the map is located in the world)");
		aInfoTime.Insert("TimezoneUTC: Change the UTC timezone (-12 to 14)");
		aInfoTime.Insert("SummerTime: Select true for summertime (+1 hour). Must be switched (false) manually in winter.");
		aInfoTime.Insert("CustomHour: Enter the hour you want to start. (0 - 23)");
		aInfoTime.Insert("---------------------------------------");

		aInfoWeather = new array<string>();
		aInfoWeather.Insert("--- SELECT MISSION WEATHER ---");
		aInfoWeather.Insert("WeatherMode: 1. System weather; 2. Simple weather; 3. Map weather (Lat/Lon); 4. Own weather (Lat/Lon)");
		aInfoWeather.Insert("Mode 3. + 4. requires '-restapi=api.open-meteo.com' in the startoptions,");
		aInfoWeather.Insert("alternate '-restapi=*' (not recommended; allows access to insecure sites).");
		aInfoWeather.Insert("StartWeather: 0. Random; 1. Clear; 2. Cloudy; 3. Overcast; 4. Rainy");
		aInfoWeather.Insert("WeatherTransitions: 0. Random; 1. Never; 2. 60 min; 3. 30 min; 4. 10 min");
		aInfoWeather.Insert("TransitionTime: 0. Random; 1. 30 min; 2. 15 min; 3. 7.5 min; 4. 5 min");
		aInfoWeather.Insert("Coordinates: Your own coordinates (Lat/Lon) e.g. 50.0755, 14.4378 to load your own weather");
		aInfoWeather.Insert("---------------------------------------");
		
		aInfoAmbient = new array<string>();
		aInfoAmbient.Insert("--- SELECT AMBIENT DENSITY ---");
		aInfoAmbient.Insert("Controls civilian, worker, animal and traffic density.");
		aInfoAmbient.Insert("AmbientFactor: 1. Off (0%); 2. Low (33%); 3. Medium (66%); 4. Normal (100%); 5. High (125%); 6. Ultra (150%)");
		aInfoAmbient.Insert("---------------------------------------");
		
		aInfoAdmin = new array<string>();
		aInfoAdmin.Insert("--- ADMIN SETUP ---");
	}

	// ------------------------------------------------------------------------
	// Serialization: Save to JSON File
	// Internal Hungarian variables mapped to clean JSON keys
	// ------------------------------------------------------------------------
	bool SaveToFile(string sFilePath)
	{
		ref PrettyJsonSaveContext saveContext = new PrettyJsonSaveContext();

		saveContext.WriteValue("Config Version", sVersion);
		saveContext.WriteValue("DESCRIPTION", aDescription);
		saveContext.WriteValue("INFORMATION DATE", aInfoDate);
		saveContext.WriteValue("INFORMATION TIME", aInfoTime);
		saveContext.WriteValue("INFORMATION WEATHER", aInfoWeather);
		saveContext.WriteValue("INFORMATION AMBIENT", aInfoAmbient);
		saveContext.WriteValue("INFORMATION ADMIN", aInfoAdmin);
		saveContext.WriteValue("DateMode", iDateMode);
		saveContext.WriteValue("StartDate", sStartDate);
		saveContext.WriteValue("TimeMode", iTimeMode);
		saveContext.WriteValue("TimezoneUTC", iTimezoneUTC);
		saveContext.WriteValue("SummerTime", bSummerTime);
		saveContext.WriteValue("CustomHour", iCustomHour);
		saveContext.WriteValue("WeatherMode", iWeatherMode);
		saveContext.WriteValue("StartWeather", iStartWeather);
		saveContext.WriteValue("WeatherTransitions", iWeatherTransitions);
		saveContext.WriteValue("TransitionTime", iTransitionTime);
		saveContext.WriteValue("Coordinates", sCoordinates);
		saveContext.WriteValue("AmbientFactor", iAmbientFactor);
		saveContext.WriteValue("DebugMode", bDebugMode);

		return saveContext.SaveToFile(sFilePath);
	}

	// ------------------------------------------------------------------------
	// Deserialization: Load from JSON File
	// Clean JSON keys read into internal Hungarian variables
	// ------------------------------------------------------------------------
	bool LoadFromFile(string sFilePath)
	{
		ref JsonLoadContext loadContext = new JsonLoadContext();
		if (!loadContext.LoadFromFile(sFilePath))
			return false;

		loadContext.ReadValue("Config Version", sVersion);
		loadContext.ReadValue("DESCRIPTION", aDescription);
		loadContext.ReadValue("INFORMATION DATE", aInfoDate);
		loadContext.ReadValue("INFORMATION TIME", aInfoTime);
		loadContext.ReadValue("INFORMATION WEATHER", aInfoWeather);
		loadContext.ReadValue("INFORMATION AMBIENT", aInfoAmbient);
		loadContext.ReadValue("INFORMATION ADMIN", aInfoAdmin);
		loadContext.ReadValue("DateMode", iDateMode);
		loadContext.ReadValue("StartDate", sStartDate);
		loadContext.ReadValue("TimeMode", iTimeMode);
		loadContext.ReadValue("TimezoneUTC", iTimezoneUTC);
		loadContext.ReadValue("SummerTime", bSummerTime);
		loadContext.ReadValue("CustomHour", iCustomHour);
		loadContext.ReadValue("WeatherMode", iWeatherMode);
		loadContext.ReadValue("StartWeather", iStartWeather);
		loadContext.ReadValue("WeatherTransitions", iWeatherTransitions);
		loadContext.ReadValue("TransitionTime", iTransitionTime);
		loadContext.ReadValue("Coordinates", sCoordinates);
		loadContext.ReadValue("AmbientFactor", iAmbientFactor);
		loadContext.ReadValue("DebugMode", bDebugMode);

		return true;
	}

	// ------------------------------------------------------------------------
	// Network serialization: Packs configuration parameters into a string array for RPC transmission
	// ------------------------------------------------------------------------
	ref array<string> ToParamArray()
	{
		ref array<string> aParams = new array<string>();
		aParams.Insert(iDateMode.ToString());
		aParams.Insert(sStartDate);
		aParams.Insert(iTimeMode.ToString());
		aParams.Insert(iTimezoneUTC.ToString());
		aParams.Insert(bSummerTime.ToString());
		aParams.Insert(iCustomHour.ToString());
		aParams.Insert(iWeatherMode.ToString());
		aParams.Insert(iStartWeather.ToString());
		aParams.Insert(iWeatherTransitions.ToString());
		aParams.Insert(iTransitionTime.ToString());
		aParams.Insert(sCoordinates);
		aParams.Insert(iAmbientFactor.ToString());
		aParams.Insert(bDebugMode.ToString());
		return aParams;
	}

	// ------------------------------------------------------------------------
	// Network deserialization: Unpacks configuration parameters from a string array
	// ------------------------------------------------------------------------
	void FromParamArray(notnull array<string> aParams)
	{
		int iCount = aParams.Count();
		int iIdx = 0; // Startindex
		string sVal = "";
		
		if (iIdx < iCount) iDateMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) sStartDate = aParams[iIdx++];
		if (iIdx < iCount) iTimeMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iTimezoneUTC = aParams[iIdx++].ToInt();
		if (iIdx < iCount)
		{
			sVal = aParams[iIdx++];
			bSummerTime = (sVal == "true" || sVal == "1");
		}
		if (iIdx < iCount) iCustomHour = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iWeatherMode = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iStartWeather = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iWeatherTransitions = aParams[iIdx++].ToInt();
		if (iIdx < iCount) iTransitionTime = aParams[iIdx++].ToInt();
		if (iIdx < iCount) sCoordinates = aParams[iIdx++];
		if (iIdx < iCount) iAmbientFactor = aParams[iIdx++].ToInt();
		if (iIdx < iCount)
		{
			sVal = aParams[iIdx++];
			bDebugMode = (sVal == "true" || sVal == "1");
		}
	}
};
`
  },
  {
    id: 'server_weather_provider_simple',
    name: 'BPR_WeatherProviderSimple.c',
    path: 'Server/TimeAndWeather/BPR_WeatherProviderSimple.c',
    folder: 'Server/TimeAndWeather',
    status: 'new',
    description: 'Simple weather provider with Markov progression, jittered transition timing, and modular thunderstorm scenarios.',
    createdAt: '2026-09-28',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
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
`
  },
  {
    id: 'server_weather_provider_open_meteo',
    name: 'BPR_WeatherProviderOpenMeteo.c',
    path: 'Server/TimeAndWeather/BPR_WeatherProviderOpenMeteo.c',
    folder: 'Server/TimeAndWeather',
    status: 'new',
    description: 'Real-world Open-Meteo weather provider with 15-minute glide transitions, fog/wind sync, and seamless fallback.',
    createdAt: '2026-09-28',
    updatedAt: '2026-09-28',
    content: `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherProviderOpenMeteo.c
// Author: Indy & AI Assistant
// Description: Server-side Open-Meteo Real-World Weather Provider for Boiling Point Reforger.
//              - Ingests high-resolution 15-minute real-world forecast data from BPR_FetchOpenMeteoData.
//              - Evaluates cloud cover, precipitation, and WMO codes to select authentic Enfusion weather states.
//              - Uses the upcoming 15-minute forecast as smooth glide target via ForceWeatherTo.
//              - Synchronizes wind speed, direction, and gusts with BPR_WindDynamicsProcessor.
//              - Combines visibility and relative humidity to dynamically drive BPR_FogDynamicsProcessor.
//              - Handles convective thunderstorm fronts with accelerated dramatic transitions.
//              - Provides seamless fallback to BPR_WeatherProviderSimple if network data is pending or unavailable.
//              - Includes full Workbench reset and cleanup capabilities.
// ============================================================================

class BPR_WeatherProviderOpenMeteo
{
	const static string CALLER_ID = "WeProOM";

	protected bool m_bIsInitialized;
	protected bool m_bIsFallbackActive;
	protected float m_fLatitude;
	protected float m_fLongitude;

	protected string m_sCurrentWeatherState;
	protected bool m_bHadRecentRain;

	// Component & Service References
	protected TimeAndWeatherManagerEntity m_pWeatherMgr;
	protected ref BPR_WeatherProviderSimple m_pFallbackProvider;

	//------------------------------------------------------------------------------------------------
	//! Initializes Open-Meteo Weather Provider with geographical coordinates
	void Init(float fLatitude, float fLongitude)
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		m_fLatitude = fLatitude;
		m_fLongitude = fLongitude;
		m_sCurrentWeatherState = "Clear";
		m_bHadRecentRain = false;

		// Retrieve TimeAndWeatherManagerEntity
		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "Initialization aborted: TimeAndWeatherManagerEntity not found!");
			return;
		}

		// Connect to FetchOpenMeteoData update invoker
		BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
		if (pFetchService)
		{
			pFetchService.GetOnWeatherDataUpdated().Remove(OnWeatherDataReceived);
			pFetchService.GetOnWeatherDataUpdated().Insert(OnWeatherDataReceived);
		}

		// Check if valid forecast data is already present in memory
		if (BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Info(CALLER_ID, string.Format("Valid Open-Meteo forecast data ready in memory for (%1, %2). Starting live weather cycle.",
				m_fLatitude.ToString(2), m_fLongitude.ToString(2)));
			StartOpenMeteoCycle();
		}
		else
		{
			// Data not ready yet -> start temporary fallback provider and request fetch
			DebugLog.Info(CALLER_ID, "Open-Meteo forecast data pending. Activating temporary fallback provider...");
			ActivateFallbackProvider();

			if (pFetchService)
				pFetchService.StartFetching(m_fLatitude, m_fLongitude);
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Activates temporary Markov-chain fallback provider while waiting for network data
	protected void ActivateFallbackProvider()
	{
		if (m_bIsFallbackActive && m_pFallbackProvider)
			return;

		m_bIsFallbackActive = true;
		m_pFallbackProvider = new BPR_WeatherProviderSimple();
		m_pFallbackProvider.Init("Cloudy", 0, 0);

		DebugLog.Info(CALLER_ID, "Fallback weather provider active.");
	}

	//------------------------------------------------------------------------------------------------
	//! Deactivates temporary fallback provider once Open-Meteo data arrives
	protected void DeactivateFallbackProvider()
	{
		if (!m_bIsFallbackActive)
			return;

		m_bIsFallbackActive = false;
		if (m_pFallbackProvider)
		{
			m_pFallbackProvider.Cleanup();
			m_pFallbackProvider = null;
		}

		DebugLog.Info(CALLER_ID, "Fallback provider deactivated. Handing over to Open-Meteo live weather.");
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker listener: Invoked when BPR_FetchOpenMeteoData finishes updating
	protected void OnWeatherDataReceived(bool bSuccess)
	{
		if (!m_bIsInitialized)
			return;

		if (bSuccess && BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Info(CALLER_ID, "New Open-Meteo weather dataset received.");
			if (m_bIsFallbackActive)
			{
				DeactivateFallbackProvider();
				StartOpenMeteoCycle();
			}
			else
			{
				// Refresh active transition with updated forecasts
				PerformWeatherTransition();
			}
		}
		else
		{
			DebugLog.Warn(CALLER_ID, "Open-Meteo update failed or empty. Ensuring fallback provider remains active.");
			if (!m_bIsFallbackActive)
				ActivateFallbackProvider();
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Starts autonomous Open-Meteo 15-minute glide cycle
	protected void StartOpenMeteoCycle()
	{
		if (!BPR_FetchOpenMeteoData.HasValidData())
		{
			ActivateFallbackProvider();
			return;
		}

		int iYear, iMonth, iDay, iHour, iMinute, iSecond;
		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = CalculateIntervalIndex(iHour, iMinute);

		float fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH;
		float fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure;
		int iWeatherCode;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iCurrentIntervalIndex, fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH, iWeatherCode, fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure))
		{
			DebugLog.Warn(CALLER_ID, string.Format("Failed to retrieve current interval index %1. Fallback active.", iCurrentIntervalIndex));
			ActivateFallbackProvider();
			return;
		}

		// 1. Resolve current state and apply immediately to Enfusion Engine (1 sec blend)
		m_sCurrentWeatherState = ResolveWeatherState(fCloudCoverPercent, fPrecipitation, iWeatherCode, fWindGustKmH);
		m_pWeatherMgr.ForceWeatherTo(false, m_sCurrentWeatherState, 1.0, 1.0);

		// Synchronize Temperature Manager
		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		if (pTempMgr)
		{
			pTempMgr.StartSimulation(m_sCurrentWeatherState);
			pTempMgr.NotifyWeatherStateChanged(m_sCurrentWeatherState);
		}

		// 2. Start and configure Wind Dynamics Processor
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
		{
			pWindProc.Start();
			pWindProc.SetTargetWindKmH(fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH);
		}

		// 3. Evaluate initial fog density
		EvaluateDynamicFog(fVisibilityMeters, fRelativeHumidity, iWeatherCode, 2.0);

		// Track precipitation history
		if (fPrecipitation > 0.05)
			m_bHadRecentRain = true;

		DebugLog.Info(CALLER_ID, string.Format("Open-Meteo live weather started: State='%1', Temp=%2°C, Clouds=%3%%, Rain=%4mm, Wind=%5km/h.",
			m_sCurrentWeatherState, fTemperature.ToString(1), fCloudCoverPercent.ToString(0), fPrecipitation.ToString(1), fWindSpeedKmH.ToString(0)));

		// 4. Schedule first transition towards the next 15-minute forecast target
		ScheduleNextIntervalTransition(iMinute, iSecond);
	}

	//------------------------------------------------------------------------------------------------
	//! Schedules transition timer to synchronize with the in-game 15-minute clock
	protected void ScheduleNextIntervalTransition(int iMinute, int iSecond)
	{
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		// Calculate remaining seconds in current 15-minute interval
		int iMinutesRemainingInInterval = 15 - (iMinute % 15);
		int iSecondsRemainingInInterval = (iMinutesRemainingInInterval * 60) - iSecond;

		int iTimerMs = Math.Max(2000, iSecondsRemainingInInterval * 1000);

		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iTimerMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Performs 15-minute transition towards the next forecast interval
	protected void PerformWeatherTransition()
	{
		if (!m_bIsInitialized)
			return;

		if (!BPR_FetchOpenMeteoData.HasValidData())
		{
			DebugLog.Warn(CALLER_ID, "No valid Open-Meteo data for next transition. Switching to fallback.");
			ActivateFallbackProvider();
			return;
		}

		int iYear, iMonth, iDay, iHour, iMinute, iSecond;
		GetInGameDateTime(iYear, iMonth, iDay, iHour, iMinute, iSecond);

		int iCurrentIntervalIndex = CalculateIntervalIndex(iHour, iMinute);
		int iNextIntervalIndex = iCurrentIntervalIndex + 1;

		int iDataCount = BPR_FetchOpenMeteoData.GetDataCount();
		if (iNextIntervalIndex >= iDataCount)
			iNextIntervalIndex = iCurrentIntervalIndex;

		float fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH;
		float fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure;
		int iWeatherCode;

		if (!BPR_FetchOpenMeteoData.GetWeatherInterval(iNextIntervalIndex, fTemperature, fPrecipitation, fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH, iWeatherCode, fCloudCoverPercent, fRelativeHumidity, fVisibilityMeters, fSurfacePressure))
		{
			DebugLog.Warn(CALLER_ID, "Failed to retrieve next weather interval. Activating fallback.");
			ActivateFallbackProvider();
			return;
		}

		// 1. Determine target weather state from 15-minute forecast
		string sTargetState = ResolveWeatherState(fCloudCoverPercent, fPrecipitation, iWeatherCode, fWindGustKmH);

		// 2. Calculate dynamic transition and hold times
		float fTotalCycleSeconds = 15.0 * 60.0; // 15-minute cycle duration

		// Base transition duration: ~10 minutes with organic jitter (±1.5 min)
		float fJitterMinutes = Math.RandomFloat(-1.5, 1.5);
		float fTransitionMinutes = Math.Clamp(10.0 + fJitterMinutes, 6.0, 13.0);

		// Thunderstorm fronts roll in faster with squalls
		if (sTargetState.Contains("Thunder"))
		{
			fTransitionMinutes = Math.RandomFloat(3.0, 5.0);
			DebugLog.Info(CALLER_ID, string.Format("Thunderstorm front approaching in Open-Meteo forecast! Accelerated blend: %1 min.", fTransitionMinutes.ToString(1)));
		}

		float fTransitionDurationSeconds = fTransitionMinutes * 60.0;
		float fHoldDurationSeconds = Math.Max(10.0, fTotalCycleSeconds - fTransitionDurationSeconds);

		// 3. Apply smooth blend to Enfusion Engine
		m_pWeatherMgr.ForceWeatherTo(false, sTargetState, fTransitionDurationSeconds, fHoldDurationSeconds);

		// Synchronize Temperature Manager
		BPR_TemperatureManager pTempMgr = BPR_TemperatureManager.GetInstance();
		if (pTempMgr)
			pTempMgr.NotifyWeatherStateChanged(sTargetState);

		// 4. Update Wind Processor with target wind and gusts
		BPR_WindDynamicsProcessor pWindProc = BPR_WindDynamicsProcessor.GetInstance();
		if (pWindProc)
			pWindProc.SetTargetWindKmH(fWindSpeedKmH, fWindDirectionDeg, fWindGustKmH);

		// 5. Evaluate Fog based on visibility and humidity
		EvaluateDynamicFog(fVisibilityMeters, fRelativeHumidity, iWeatherCode, fTransitionMinutes);

		// Track precipitation
		if (fPrecipitation > 0.05)
			m_bHadRecentRain = true;

		DebugLog.Info(CALLER_ID, string.Format("Glide Transition: '%1' -> '%2' (Clouds: %3%%, Rain: %4mm, Wind: %5km/h, Visibility: %6m).",
			m_sCurrentWeatherState, sTargetState, fCloudCoverPercent.ToString(0), fPrecipitation.ToString(1), fWindSpeedKmH.ToString(0), fVisibilityMeters.ToString(0)));

		m_sCurrentWeatherState = sTargetState;

		// 6. Schedule next 15-minute cycle tick
		int iNextCycleMs = Math.Round(fTotalCycleSeconds * 1000.0);
		GetGame().GetCallqueue().Remove(PerformWeatherTransition);
		GetGame().GetCallqueue().CallLater(PerformWeatherTransition, iNextCycleMs, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Maps cloud cover, precipitation, WMO code, and wind gusts to an authentic Enfusion weather state
	protected string ResolveWeatherState(float fCloudCover, float fPrecipitation, int iWeatherCode, float fWindGust)
	{
		// 1. Thunderstorm Evaluation (WMO 95: Slight/Mod, 96: Hail, 99: Severe Hail)
		bool bIsThunderstorm = (iWeatherCode == 95 || iWeatherCode == 96 || iWeatherCode == 99);

		if (bIsThunderstorm)
		{
			// Cloud family selection
			string sCloudFamily = "Broken";
			if (fCloudCover < 50.0)
				sCloudFamily = "Cloudy";
			else if (fCloudCover >= 85.0)
				sCloudFamily = "Overcast";

			// Intensity selection
			if (fPrecipitation < 0.2)
				return string.Format("%1ThunderDry", sCloudFamily);

			if (iWeatherCode == 99 || fWindGust >= 65.0 || fPrecipitation >= 8.0)
				return string.Format("%1ThunderExtreme", sCloudFamily);

			return string.Format("%1ThunderStrong", sCloudFamily);
		}

		// 2. Standard Cloud Family Base
		string sBaseFamily = "Clear";
		if (fCloudCover >= 90.0)
			sBaseFamily = "Overcast";
		else if (fCloudCover >= 70.0)
			sBaseFamily = "Broken";
		else if (fCloudCover >= 40.0)
			sBaseFamily = "Cloudy";
		else if (fCloudCover >= 15.0)
			sBaseFamily = "Few";
		else
			sBaseFamily = "Clear";

		// 3. Precipitation Intensity Mapping
		// Dry
		if (fPrecipitation < 0.1)
			return sBaseFamily;

		// Light Rain / Drizzle (0.1 - 1.5 mm/h)
		if (fPrecipitation < 1.5)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few")
				return "FewDrizzle";
			if (sBaseFamily == "Cloudy")
				return "CloudyDrizzle";
			if (sBaseFamily == "Broken")
				return "BrokenNormal";
			return "OvercastNormal";
		}

		// Moderate / Normal Rain (1.5 - 5.0 mm/h)
		if (fPrecipitation < 5.0)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few")
				return "FewNormal";
			if (sBaseFamily == "Cloudy")
				return "CloudyNormal";
			if (sBaseFamily == "Broken")
				return "BrokenNormal";
			return "OvercastNormal";
		}

		// Heavy Rain (5.0 - 10.0 mm/h)
		if (fPrecipitation < 10.0)
		{
			if (sBaseFamily == "Clear" || sBaseFamily == "Few" || sBaseFamily == "Cloudy")
				return "CloudyStrong";
			if (sBaseFamily == "Broken")
				return "BrokenStrong";
			return "OvercastStrong";
		}

		// Extreme Storm Rain (> 10.0 mm/h)
		if (sBaseFamily == "Overcast" || fWindGust >= 55.0)
			return "Rainy";

		return "BrokenExtreme";
	}

	//------------------------------------------------------------------------------------------------
	//! Dynamically evaluates atmospheric fog based on physical visibility and relative humidity
	protected void EvaluateDynamicFog(float fVisibilityMeters, float fRelativeHumidity, int iWeatherCode, float fBlendMinutes)
	{
		BPR_FogDynamicsProcessor pFogProcessor = BPR_FogDynamicsProcessor.GetInstance();
		if (!pFogProcessor)
			return;

		float fFogDensity = 0.0;

		// WMO 45 (Fog) or WMO 48 (Depositing rime fog)
		if (iWeatherCode == 45 || iWeatherCode == 48)
		{
			if (fVisibilityMeters < 500.0)
				fFogDensity = 0.80;
			else if (fVisibilityMeters < 1000.0)
				fFogDensity = 0.60;
			else
				fFogDensity = 0.45;
		}
		else
		{
			// Physical visibility curve combined with humidity saturation
			if (fVisibilityMeters >= 10000.0)
			{
				fFogDensity = 0.0;
			}
			else if (fVisibilityMeters >= 5000.0)
			{
				// Light haze (5% - 10%)
				fFogDensity = 0.05 + (((10000.0 - fVisibilityMeters) / 5000.0) * 0.05);
			}
			else if (fVisibilityMeters >= 2000.0)
			{
				// Mist (10% - 25%)
				fFogDensity = 0.10 + (((5000.0 - fVisibilityMeters) / 3000.0) * 0.15);
			}
			else if (fVisibilityMeters >= 1000.0)
			{
				// Light fog (25% - 40%)
				fFogDensity = 0.25 + (((2000.0 - fVisibilityMeters) / 1000.0) * 0.15);
			}
			else if (fVisibilityMeters >= 500.0)
			{
				// Moderate ground fog (40% - 65%)
				fFogDensity = 0.40 + (((1000.0 - fVisibilityMeters) / 500.0) * 0.25);
			}
			else
			{
				// Dense fog (< 500m: 65% - 95%)
				fFogDensity = 0.65 + (((500.0 - Math.Max(0.0, fVisibilityMeters)) / 500.0) * 0.30);
			}

			// Humidity threshold: Low humidity (<65%) indicates dry dust/smog rather than water droplet fog
			if (fRelativeHumidity < 65.0)
			{
				fFogDensity = 0.0;
			}
			else if (fRelativeHumidity < 85.0)
			{
				float fHumidityFactor = Math.Clamp((fRelativeHumidity - 65.0) / 20.0, 0.0, 1.0);
				fFogDensity *= fHumidityFactor;
			}
		}

		pFogProcessor.SetTargetFogDensity(fFogDensity, fBlendMinutes * 60.0);
	}

	//------------------------------------------------------------------------------------------------
	//! Calculates interval index (0 to 191) for current in-game hour and minute
	protected int CalculateIntervalIndex(int iHour, int iMinute)
	{
		int iClampedHour = Math.Clamp(iHour, 0, 23);
		int iClampedMinute = Math.Clamp(iMinute, 0, 59);

		return (iClampedHour * 4) + (iClampedMinute / 15);
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves current in-game date and time
	protected void GetInGameDateTime(out int iYear, out int iMonth, out int iDay, out int iHour, out int iMinute, out int iSecond)
	{
		iYear = 2026;
		iMonth = 7;
		iDay = 15;
		iHour = 12;
		iMinute = 0;
		iSecond = 0;

		if (!m_pWeatherMgr)
			m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);

		if (m_pWeatherMgr)
		{
			m_pWeatherMgr.GetDate(iYear, iMonth, iDay);
			m_pWeatherMgr.GetHoursMinutesSeconds(iHour, iMinute, iSecond);
		}
	}

	// --- Getters & Queries ---
	string GetCurrentState() { return m_sCurrentWeatherState; }
	bool HadRecentRain() { return m_bHadRecentRain; }
	bool IsFallbackActive() { return m_bIsFallbackActive; }

	//------------------------------------------------------------------------------------------------
	//! Cleans up active weather timers, listeners, and fallback modules
	void Cleanup()
	{
		DebugLog.Info(CALLER_ID, "Cleaning up Open-Meteo Weather Provider...");

		GetGame().GetCallqueue().Remove(PerformWeatherTransition);

		BPR_FetchOpenMeteoData pFetchService = BPR_FetchOpenMeteoData.GetInstance();
		if (pFetchService && pFetchService.GetOnWeatherDataUpdated())
			pFetchService.GetOnWeatherDataUpdated().Remove(OnWeatherDataReceived);

		if (m_pFallbackProvider)
		{
			m_pFallbackProvider.Cleanup();
			m_pFallbackProvider = null;
		}

		m_bIsInitialized = false;
		m_bIsFallbackActive = false;
	}
};
`
  },
];


export const STANDARD_FOLDERS = [
  'Components',
  'BaseManagers',
  'Configs',
  'Server',
  'Server/TimeAndWeather/Utilities',
  'Client',
  'Client/UI',
  'Utilities/Global',
  'Utilities/Server',
  'Utilities/Client'
];
