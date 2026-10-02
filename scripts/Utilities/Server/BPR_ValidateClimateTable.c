// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_ValidateClimateTable.c
// Author: Indy & AI Assistant
// Description: Server utility class for validating and sanitizing climate tables (Caller: ValClimTab).
//              Ensures exactly 12 monthly values, verifies Min <= Max (with auto-swap),
//              and checks physical temperature limits (-70.0°C to +65.0°C).
// ============================================================================

class BPR_ValidateClimateTable
{
	const static string CALLER_ID = "ValClimTab";

	const static float MIN_ALLOWED_TEMP = -70.0;
	const static float MAX_ALLOWED_TEMP = 65.0;

	//------------------------------------------------------------------------------------------------
	//! Validates a complete BPR_ClimateProfile data object
	static bool ValidateProfile(BPR_ClimateProfile pProfile)
	{
		if (!pProfile)
		{
			DebugLog.Err(CALLER_ID, "Validation failed: BPR_ClimateProfile is null!");
			return false;
		}

		string sLabel = pProfile.m_sProfileName;
		if (sLabel == "")
			sLabel = pProfile.m_sSource;

		return ValidateTable(pProfile.m_aMinTemp, pProfile.m_aMaxTemp, sLabel);
	}

	//------------------------------------------------------------------------------------------------
	//! Validates and sanitizes two 12-month float arrays (Min and Max)
	static bool ValidateTable(array<float> aMin, array<float> aMax, string sProfileName = "")
	{
		if (!aMin || !aMax)
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for '%1': One or both temperature arrays are null!", sProfileName));
			return false;
		}

		int iCountMin = aMin.Count();
		int iCountMax = aMax.Count();

		if (iCountMin != 12 || iCountMax != 12)
		{
			DebugLog.Err(CALLER_ID, string.Format("Validation failed for '%1': Incomplete month count (Min: %2, Max: %3; Expected: 12).", sProfileName, iCountMin, iCountMax));
			return false;
		}

		bool bHasRepairs = false;

		for (int i = 0; i < 12; i++)
		{
			float fMin = aMin[i];
			float fMax = aMax[i];

			// Auto-correct inverted min/max
			if (fMin > fMax)
			{
				DebugLog.Warn(CALLER_ID, string.Format("Month index %1 in '%2': Min (%3°C) > Max (%4°C). Values swapped automatically.", i + 1, sProfileName, fMin, fMax));
				aMin[i] = fMax;
				aMax[i] = fMin;
				fMin = aMin[i];
				fMax = aMax[i];
				bHasRepairs = true;
			}

			// Sanity check physical bounds
			if (fMin < MIN_ALLOWED_TEMP || fMax > MAX_ALLOWED_TEMP)
			{
				DebugLog.Err(CALLER_ID, string.Format("Month index %1 in '%2': Temperature out of realistic bounds (%3°C to %4°C). Limits: %5°C..%6°C.", i + 1, sProfileName, fMin, fMax, MIN_ALLOWED_TEMP, MAX_ALLOWED_TEMP));
				return false;
			}
		}

		if (bHasRepairs)
		{
			DebugLog.Info(CALLER_ID, string.Format("Climate table '%1' validated with automatic corrections.", sProfileName));
		}

		return true;
	}
};
