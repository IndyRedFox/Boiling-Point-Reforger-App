// ============================================================================
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
