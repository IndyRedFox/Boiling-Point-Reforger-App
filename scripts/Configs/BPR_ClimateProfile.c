// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClimateProfile.c
// Author: Indy & AI Assistant
// Description: Unified data container class for 12-month min/max climate profiles.
//              Holds profile name, origin source, climate zone enum, and monthly
//              temperature arrays.
// ============================================================================

enum BPR_EClimateZone
{
	CONTINENTAL,     // Central / Eastern Europe (Prague, Chernarus, Livonia) - warm summers, cold winters
	OCEANIC,         // Maritime / Coastal (Everon, Arland, Western Europe) - mild, wet, windy
	MEDITERRANEAN,   // Southern Europe (Malden, Altis, Stratis) - hot dry summers, mild winters
	ARID,            // Desert / Steppe (Takistan, Anizay) - extreme heat, dry air, cold nights
	TROPICAL,        // Equatorial / Jungle (Tanoa, Lingor) - hot, humid, year-round convective rains
	SUBARCTIC        // Far North (Namalsk) - freezing cold winters, short cool summers
};

class BPR_ClimateProfile
{
	string m_sProfileName;
	string m_sSource;
	BPR_EClimateZone m_eClimateZone = BPR_EClimateZone.CONTINENTAL;
	ref array<float> m_aMinTemp = new array<float>();
	ref array<float> m_aMaxTemp = new array<float>();

	//------------------------------------------------------------------------------------------------
	//! Converts BPR_EClimateZone enum to human-readable string
	static string ClimateZoneToString(BPR_EClimateZone eZone)
	{
		switch (eZone)
		{
			case BPR_EClimateZone.CONTINENTAL:
				return "Continental";
			case BPR_EClimateZone.OCEANIC:
				return "Oceanic";
			case BPR_EClimateZone.MEDITERRANEAN:
				return "Mediterranean";
			case BPR_EClimateZone.ARID:
				return "Arid";
			case BPR_EClimateZone.TROPICAL:
				return "Tropical";
			case BPR_EClimateZone.SUBARCTIC:
				return "Subarctic";
		}
		return "Continental";
	}

	//------------------------------------------------------------------------------------------------
	//! Converts string to BPR_EClimateZone enum
	static BPR_EClimateZone StringToClimateZone(string sZone)
	{
		string sLower = sZone;
		sLower.ToLower();

		if (sLower.Contains("ocean") || sLower.Contains("maritim"))
			return BPR_EClimateZone.OCEANIC;
		if (sLower.Contains("mediterran"))
			return BPR_EClimateZone.MEDITERRANEAN;
		if (sLower.Contains("arid") || sLower.Contains("desert") || sLower.Contains("wueste"))
			return BPR_EClimateZone.ARID;
		if (sLower.Contains("tropic") || sLower.Contains("jungle") || sLower.Contains("equator"))
			return BPR_EClimateZone.TROPICAL;
		if (sLower.Contains("subarctic") || sLower.Contains("arctic") || sLower.Contains("polar"))
			return BPR_EClimateZone.SUBARCTIC;

		return BPR_EClimateZone.CONTINENTAL;
	}

	//------------------------------------------------------------------------------------------------
	//! Converts numeric ID (1-6) to BPR_EClimateZone enum
	static BPR_EClimateZone IntToClimateZone(int iZoneID)
	{
		switch (iZoneID)
		{
			case 1:
				return BPR_EClimateZone.CONTINENTAL;
			case 2:
				return BPR_EClimateZone.OCEANIC;
			case 3:
				return BPR_EClimateZone.MEDITERRANEAN;
			case 4:
				return BPR_EClimateZone.ARID;
			case 5:
				return BPR_EClimateZone.TROPICAL;
			case 6:
				return BPR_EClimateZone.SUBARCTIC;
		}
		return BPR_EClimateZone.CONTINENTAL;
	}

	//------------------------------------------------------------------------------------------------
	//! Converts BPR_EClimateZone enum to numeric ID (1-6)
	static int ClimateZoneToInt(BPR_EClimateZone eZone)
	{
		switch (eZone)
		{
			case BPR_EClimateZone.CONTINENTAL:
				return 1;
			case BPR_EClimateZone.OCEANIC:
				return 2;
			case BPR_EClimateZone.MEDITERRANEAN:
				return 3;
			case BPR_EClimateZone.ARID:
				return 4;
			case BPR_EClimateZone.TROPICAL:
				return 5;
			case BPR_EClimateZone.SUBARCTIC:
				return 6;
		}
		return 1;
	}
};
