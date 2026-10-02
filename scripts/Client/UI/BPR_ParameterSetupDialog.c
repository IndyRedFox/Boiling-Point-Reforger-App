// ============================================================================
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
