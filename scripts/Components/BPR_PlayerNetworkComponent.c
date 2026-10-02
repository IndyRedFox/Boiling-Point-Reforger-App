// ============================================================================
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
