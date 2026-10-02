// ============================================================================
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
		pFile.WriteLine("\t\"DESCRIPTION\": [");
		pFile.WriteLine("\t\t\"--- Boiling Point Reforger Custom Climate Configuration ---\",");
		pFile.WriteLine("\t\t\"Set CustomClimate to true to activate this custom table.\",");
		pFile.WriteLine("\t\t\"Define monthly min/max temperatures in degrees Celsius.\",");
		pFile.WriteLine("\t\t\"----------------------------------------------------------\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine("");
		pFile.WriteLine("\t\"CustomClimate\": false,");
		pFile.WriteLine("\t\"ClimateName\": \"Name for your map / scenario\",");
		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION CLIMATE ZONE\": [");
		pFile.WriteLine("\t\t\"--- Climate Zone (1-6) ---\",");
		pFile.WriteLine("\t\t\"1. Continental   (Central / Eastern Europe - warm summer, cold winter)\",");
		pFile.WriteLine("\t\t\"2. Oceanic       (Coastal / Maritime - mild, wet, windy)\",");
		pFile.WriteLine("\t\t\"3. Mediterranean (Southern Europe - hot dry summer, mild winter)\",");
		pFile.WriteLine("\t\t\"4. Arid          (Desert / Steppe - extreme heat, dry air, cold night)\",");
		pFile.WriteLine("\t\t\"5. Tropical      (Equatorial / Jungle - hot, humid, year-round rain)\",");
		pFile.WriteLine("\t\t\"6. Subarctic     (Cold North - freezing winter, short cool summer)\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine("\t\"ClimateZone\": 1,");
		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION MINIMUM TEMPERATURE\": [");
		pFile.WriteLine("\t\t\"--- Monthly Minimum Temperatures (Night / Early Dawn) ---\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine("\t\"Min_January\": -2.0,");
		pFile.WriteLine("\t\"Min_February\": -1.0,");
		pFile.WriteLine("\t\"Min_March\": 2.0,");
		pFile.WriteLine("\t\"Min_April\": 5.5,");
		pFile.WriteLine("\t\"Min_May\": 9.5,");
		pFile.WriteLine("\t\"Min_June\": 13.0,");
		pFile.WriteLine("\t\"Min_July\": 15.0,");
		pFile.WriteLine("\t\"Min_August\": 14.5,");
		pFile.WriteLine("\t\"Min_September\": 11.0,");
		pFile.WriteLine("\t\"Min_October\": 6.5,");
		pFile.WriteLine("\t\"Min_November\": 2.5,");
		pFile.WriteLine("\t\"Min_December\": -0.5,");
		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION MAXIMUM TEMPERATURE\": [");
		pFile.WriteLine("\t\t\"--- Monthly Maximum Temperatures (Day Peak / Solar Noon) ---\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine("\t\"Max_January\": 3.0,");
		pFile.WriteLine("\t\"Max_February\": 5.0,");
		pFile.WriteLine("\t\"Max_March\": 10.0,");
		pFile.WriteLine("\t\"Max_April\": 15.0,");
		pFile.WriteLine("\t\"Max_May\": 19.5,");
		pFile.WriteLine("\t\"Max_June\": 23.0,");
		pFile.WriteLine("\t\"Max_July\": 25.5,");
		pFile.WriteLine("\t\"Max_August\": 25.0,");
		pFile.WriteLine("\t\"Max_September\": 20.0,");
		pFile.WriteLine("\t\"Max_October\": 14.0,");
		pFile.WriteLine("\t\"Max_November\": 7.5,");
		pFile.WriteLine("\t\"Max_December\": 4.0");
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
		pFile.WriteLine("\t\"DESCRIPTION\": [");
		pFile.WriteLine("\t\t\"--- Boiling Point Reforger Custom Climate Configuration ---\",");
		pFile.WriteLine("\t\t\"Set CustomClimate to true to activate this custom table.\",");
		pFile.WriteLine("\t\t\"Define monthly min/max temperatures in degrees Celsius.\",");
		pFile.WriteLine("\t\t\"----------------------------------------------------------\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine("");
		pFile.WriteLine(string.Format("\t\"CustomClimate\": %1,", sActiveStr));
		pFile.WriteLine(string.Format("\t\"ClimateName\": \"%1\",", pProfile.m_sProfileName));
		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION CLIMATE ZONE\": [");
		pFile.WriteLine("\t\t\"--- Climate Zone (1-6) ---\",");
		pFile.WriteLine("\t\t\"1. Continental   (Central / Eastern Europe - warm summer, cold winter)\",");
		pFile.WriteLine("\t\t\"2. Oceanic       (Coastal / Maritime - mild, wet, windy)\",");
		pFile.WriteLine("\t\t\"3. Mediterranean (Southern Europe - hot dry summer, mild winter)\",");
		pFile.WriteLine("\t\t\"4. Arid          (Desert / Steppe - extreme heat, dry air, cold night)\",");
		pFile.WriteLine("\t\t\"5. Tropical      (Equatorial / Jungle - hot, humid, year-round rain)\",");
		pFile.WriteLine("\t\t\"6. Subarctic     (Cold North - freezing winter, short cool summer)\"");
		pFile.WriteLine("\t],");
		pFile.WriteLine(string.Format("\t\"ClimateZone\": %1,", iZoneID));
		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION MINIMUM TEMPERATURE\": [");
		pFile.WriteLine("\t\t\"--- Monthly Minimum Temperatures (Night / Early Dawn) ---\"");
		pFile.WriteLine("\t],");

		for (int i = 0; i < 12; i++)
		{
			pFile.WriteLine(string.Format("\t\"Min_%1\": %2,", m_aMonthNames[i], pProfile.m_aMinTemp[i]));
		}

		pFile.WriteLine("");
		pFile.WriteLine("\t\"INFORMATION MAXIMUM TEMPERATURE\": [");
		pFile.WriteLine("\t\t\"--- Monthly Maximum Temperatures (Day Peak / Solar Noon) ---\"");
		pFile.WriteLine("\t],");

		for (int j = 0; j < 12; j++)
		{
			string sTrailingComma = ",";
			if (j == 11)
				sTrailingComma = "";
			pFile.WriteLine(string.Format("\t\"Max_%1\": %2%3", m_aMonthNames[j], pProfile.m_aMaxTemp[j], sTrailingComma));
		}

		pFile.WriteLine("}");
		pFile.Close();
		return true;
	}
};
