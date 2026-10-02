// ============================================================================
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
