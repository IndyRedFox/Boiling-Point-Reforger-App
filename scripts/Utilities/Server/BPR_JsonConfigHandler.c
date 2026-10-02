// ============================================================================
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
