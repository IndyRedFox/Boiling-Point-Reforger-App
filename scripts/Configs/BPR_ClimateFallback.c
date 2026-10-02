// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ClimateFallback.c
// Author: Indy & AI Assistant
// Description: Tier 4 of the climate cascade (Caller: ClimFall).
//              Provides the unconditional, guaranteed base climate profile
//              for the Bohemia Interactive HQ in Prague (50.0755° N, 14.4378° E).
//              Explicitly assigned to BPR_EClimateZone.CONTINENTAL.
//              Used as the rock-solid ultimate fallback if all prior tiers
//              (Custom JSON, Climate Database, Coordinates Generator) fail.
// ============================================================================

class BPR_ClimateFallback
{
	const static string CALLER_ID = "ClimFallb";

	//------------------------------------------------------------------------------------------------
	// 12-Month Climatological Average for Prague, Czech Republic (Bohemia Interactive HQ)
	// Month order: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
	//------------------------------------------------------------------------------------------------
	protected static ref array<float> s_aFallbackMin = {
		-3.0, -2.5, 0.5, 4.5, 9.0, 12.5, 14.5, 14.0, 10.0, 5.5, 1.5, -1.8
	};

	protected static ref array<float> s_aFallbackMax = {
		2.0, 3.8, 8.5, 14.5, 19.5, 23.0, 25.5, 25.0, 20.0, 13.5, 7.0, 3.0
	};

	//------------------------------------------------------------------------------------------------
	//! Generates and returns the guaranteed base climate profile for Bohemia HQ (Prague).
	//! This profile is pre-validated and guaranteed to never return null.
	static BPR_ClimateProfile GetFallbackProfile()
	{
		ref BPR_ClimateProfile pProfile = new BPR_ClimateProfile();
		pProfile.m_sProfileName = BPR_MapUtility.DEFAULT_FALLBACK_NAME;
		pProfile.m_sSource = "BaseFallback:BisHQ";
		pProfile.m_eClimateZone = BPR_EClimateZone.CONTINENTAL;

		pProfile.m_aMinTemp.Copy(s_aFallbackMin);
		pProfile.m_aMaxTemp.Copy(s_aFallbackMax);

		// Sanity check via validator
		if (!BPR_ValidateClimateTable.ValidateProfile(pProfile))
		{
			DebugLog.Err(CALLER_ID, "Critical error: Fallback climate profile failed internal validation!");
		}

		DebugLog.Info(CALLER_ID, "Base climate fallback loaded (Bohemia Interactive HQ, Prague [Continental]: Jan -3..2°C | Jul 14.5..25.5°C).");
		return pProfile;
	}
};
