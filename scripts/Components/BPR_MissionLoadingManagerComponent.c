// ============================================================================
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
