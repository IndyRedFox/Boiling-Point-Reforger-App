// ============================================================================
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
