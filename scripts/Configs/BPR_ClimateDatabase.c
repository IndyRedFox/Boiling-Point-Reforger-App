// ============================================================================
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
