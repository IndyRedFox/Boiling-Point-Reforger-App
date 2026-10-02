// ============================================================================
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
