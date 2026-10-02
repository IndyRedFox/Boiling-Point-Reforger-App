// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_CoordinatesClimateGenerator.c
// Author: Indy & AI Assistant
// Description: Tier 3 of the climate cascade (Caller: CordClimG).
//              Generates a full 12-month climate profile based on geographical
//              coordinates (latitude and longitude) and derives the appropriate
//              BPR_EClimateZone mathematically.
//              Uses climatological insolation, seasonal amplitude curves,
//              hemisphere phase shifting, and standard diurnal spread.
//              Validates the output profile via BPR_ValidateClimateTable.
// ============================================================================

class BPR_CoordinatesClimateGenerator
{
	const static string CALLER_ID = "CordClimG";

	//------------------------------------------------------------------------------------------------
	//! Generates a 12-month climate profile for the given coordinates (or retrieves original terrain coordinates if omitted).
	//! Returns a validated BPR_ClimateProfile object.
	static BPR_ClimateProfile GenerateProfile(float fInLat = 999.0, float fInLon = 999.0)
	{
		float fLatitude = fInLat;
		float fLongitude = fInLon;
		string sSource = "";
		string sMapName = "";

		// If coordinates not provided, fetch original terrain coordinates from MapUtility
		if (fLatitude == 999.0 || fLongitude == 999.0)
		{
			BPR_MapUtility.GetOriginalCoordinates(fLatitude, fLongitude, sSource);
		}
		else
		{
			sSource = string.Format("CustomCoordinates (%1, %2)", fLatitude, fLongitude);
		}

		BPR_MapUtility.GetMapName(sMapName);
		if (sMapName == "")
			sMapName = "UnknownTerrain";

		// Clamp latitude to habitable geographical bounds (-85 to +85)
		float fClampedLat = Math.Clamp(fLatitude, -85.0, 85.0);
		float fAbsLat = Math.AbsFloat(fClampedLat);
		float fLatRad = fAbsLat * Math.DEG2RAD;

		// 1. Annual Mean Base Temperature (Equator ~27°C, Polar ~ -22°C)
		float fBaseTemp = (27.5 * Math.Cos(fLatRad)) - (16.0 * (1.0 - Math.Cos(fLatRad)));

		// 2. Seasonal Temperature Amplitude (Tropics ~1.5°C swing, Sub-arctic ~18°C swing)
		float fSeasonAmplitude = 1.5 + (18.0 * Math.Sin(fLatRad));

		// 3. Diurnal Min-to-Max Baseline Spread (~6.0°C to 10.0°C depending on latitude)
		float fDiurnalSpread = 6.0 + (4.0 * Math.Cos(fLatRad));
		float fHalfSpread = fDiurnalSpread * 0.5;

		// 4. Hemisphere check: Northern peaks in July (month 7), Southern peaks in January (month 1)
		bool bIsNorthern = (fClampedLat >= 0.0);
		int iPeakMonth = 7;
		if (!bIsNorthern)
			iPeakMonth = 1;

		// 5. Determine Climate Zone based on geographical coordinates and seasonal amplitude
		BPR_EClimateZone eZone = CalculateClimateZone(fClampedLat, fLongitude, fSeasonAmplitude);
		string sZoneName = BPR_ClimateProfile.ClimateZoneToString(eZone);

		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = string.Format("%1 (Lat: %2, Lon: %3 | %4)", sMapName, fLatitude, fLongitude, sZoneName);
		pProfile.m_sSource = "GeneratedCoordinates:" + sSource;
		pProfile.m_eClimateZone = eZone;

		// 6. Calculate 12 monthly Min/Max values
		for (int iMonth = 1; iMonth <= 12; iMonth++)
		{
			// Angular distance from summer peak month (in radians)
			float fMonthOffset = (iMonth - iPeakMonth);
			float fAngleRad = fMonthOffset * (Math.PI / 6.0); // 30 degrees (pi/6) per month

			// Cosine wave: +1.0 at peak summer, -1.0 at winter minimum
			float fSeasonalFactor = Math.Cos(fAngleRad);
			float fMonthlyMean = fBaseTemp + (fSeasonAmplitude * fSeasonalFactor);

			// Round to 1 decimal place
			float fMin = Math.Round((fMonthlyMean - fHalfSpread) * 10.0) / 10.0;
			float fMax = Math.Round((fMonthlyMean + fHalfSpread) * 10.0) / 10.0;

			pProfile.m_aMinTemp.Insert(fMin);
			pProfile.m_aMaxTemp.Insert(fMax);
		}

		// 7. Final verification via centralized validator
		if (!BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for generated profile of '%1'.", sMapName));
			return null;
		}

		DebugLog.Info(CALLER_ID, string.Format("Climate profile generated for '%1' (Coords: %2, %3 | Zone: %4 | Jan: %5..%6°C | Jul: %7..%8°C).",
			sMapName, fLatitude, fLongitude, sZoneName,
			pProfile.m_aMinTemp[0], pProfile.m_aMaxTemp[0],
			pProfile.m_aMinTemp[6], pProfile.m_aMaxTemp[6]));

		return pProfile;
	}

	//------------------------------------------------------------------------------------------------
	//! Derives BPR_EClimateZone from latitude, longitude, and seasonal temperature amplitude
	static BPR_EClimateZone CalculateClimateZone(float fLat, float fLon, float fSeasonAmplitude)
	{
		float fAbsLat = Math.AbsFloat(Math.Clamp(fLat, -85.0, 85.0));

		// Polar / Subarctic
		if (fAbsLat >= 60.0)
			return BPR_EClimateZone.SUBARCTIC;

		// Equatorial / Tropical (Tropics of Cancer and Capricorn: ~23.5°)
		if (fAbsLat < 23.5)
			return BPR_EClimateZone.TROPICAL;

		// Subtropical / Mediterranean / Arid (23.5° to 35.0°)
		if (fAbsLat < 35.0)
		{
			// Arid/Desert latitudes (e.g. Sahara, Middle East: Lon 10 to 65 E in Northern hemisphere)
			if (fLat > 0 && fLon >= 10.0 && fLon <= 65.0)
				return BPR_EClimateZone.ARID;

			return BPR_EClimateZone.MEDITERRANEAN;
		}

		// Temperate Belt (35.0° to 60.0°)
		// In Europe/Atlantic: Western coastlines/islands (Lon -25° to +3°) have an Oceanic/Maritime climate
		// Continental landmasses (Lon > 3.0° or high seasonal amplitude > 10.0°C) have a Continental climate
		if (fLon >= -25.0 && fLon <= 3.0 && fSeasonAmplitude < 14.0)
			return BPR_EClimateZone.OCEANIC;

		return BPR_EClimateZone.CONTINENTAL;
	}
};
