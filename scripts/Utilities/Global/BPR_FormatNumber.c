// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_FormatNumber.c
// Author: Indy & AI Assistant
// Description: Global utility class for formatting numbers (int and float).
//              Provides decimals rounding, leading zeroes, thousand grouping,
//              custom decimal separators, and sign control.
// ============================================================================

class BPR_FormatNumber
{
	const static string CALLER_ID = "FmtNum";

	//------------------------------------------------------------------------------------------------
	//! Formats an integer with leading zeroes, thousand grouping, and optional sign
	//! Example: FormatInt(1500000, 1, true, ".") -> "1.500.000"
	//! Example: FormatInt(5, 3) -> "005"
	static string FormatInt(int iValue, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", bool bForceSign = false)
	{
		bool bIsNegative = (iValue < 0);
		int iAbsValue = Math.AbsInt(iValue);
		string sDigits = iAbsValue.ToString();

		// Add leading zeroes if required
		while (sDigits.Length() < iMinDigits)
		{
			sDigits = "0" + sDigits;
		}

		// Insert grouping separators in 3-digit blocks
		string sResult = "";
		if (bUseGrouping && sGroupingSeparator != "")
		{
			int iLen = sDigits.Length();
			int iRemainder = iLen % 3;
			if (iRemainder == 0)
				iRemainder = 3;

			sResult = sDigits.Substring(0, iRemainder);
			for (int iIdx = iRemainder; iIdx < iLen; iIdx += 3)
			{
				sResult = sResult + sGroupingSeparator + sDigits.Substring(iIdx, 3);
			}
		}
		else
		{
			sResult = sDigits;
		}

		// Apply sign
		if (bIsNegative)
			sResult = "-" + sResult;
		else if (bForceSign && iValue > 0)
			sResult = "+" + sResult;

		return sResult;
	}

	//------------------------------------------------------------------------------------------------
	//! Formats a float with decimals, leading zeroes, thousand grouping, and customizable separators
	//! Example: FormatFloat(12345.678, 2, 1, true, ".", ",") -> "12.345,68"
	//! Example: FormatFloat(-0.5, 2, 1, false, "", ",", false) -> "-0,50"
	static string FormatFloat(float fValue, int iDecimals = 2, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", string sDecimalSeparator = ",", bool bForceSign = false)
	{
		bool bIsNegative = (fValue < 0.0);
		float fAbsValue = Math.AbsFloat(fValue);

		// If no decimal places are requested, round directly to integer
		if (iDecimals <= 0)
		{
			int iRoundedInt = Math.Round(fAbsValue);
			if (bIsNegative)
				iRoundedInt = -iRoundedInt;

			return FormatInt(iRoundedInt, iMinDigits, bUseGrouping, sGroupingSeparator, bForceSign);
		}

		// Calculate rounding precision factor
		float fFactor = Math.Pow(10, iDecimals);
		float fRounded = Math.Round(fAbsValue * fFactor) / fFactor;

		int iIntegerPart = Math.Floor(fRounded);
		int iFractionPart = Math.Round((fRounded - iIntegerPart) * fFactor);

		// Handle overflow when rounding up (e.g. 0.999 -> 1.00)
		if (iFractionPart >= fFactor)
		{
			iIntegerPart++;
			iFractionPart = 0;
		}

		// Format integer portion without sign (sign is applied to final result)
		string sFormattedInteger = FormatInt(iIntegerPart, iMinDigits, bUseGrouping, sGroupingSeparator, false);

		// Format fraction portion with exact decimal padding
		string sFractionString = iFractionPart.ToString();
		while (sFractionString.Length() < iDecimals)
		{
			sFractionString = "0" + sFractionString;
		}

		string sResult = sFormattedInteger + sDecimalSeparator + sFractionString;

		// Apply sign
		if (bIsNegative)
			sResult = "-" + sResult;
		else if (bForceSign && fValue > 0.0)
			sResult = "+" + sResult;

		return sResult;
	}

	//------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------
	//! Convenient overload: Format integer
	static string Format(int iValue, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", bool bForceSign = false)
	{
		return FormatInt(iValue, iMinDigits, bUseGrouping, sGroupingSeparator, bForceSign);
	}

	//------------------------------------------------------------------------------------------------
	//! Convenient overload: Format float
	static string Format(float fValue, int iDecimals = 2, int iMinDigits = 1, bool bUseGrouping = false, string sGroupingSeparator = ".", string sDecimalSeparator = ",", bool bForceSign = false)
	{
		return FormatFloat(fValue, iDecimals, iMinDigits, bUseGrouping, sGroupingSeparator, sDecimalSeparator, bForceSign);
	}

	//------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats an integer with thousand separators (e.g. 1500000 -> "1.500.000")
	static string FormatThousands(int iValue, string sSeparator = ".")
	{
		return FormatInt(iValue, 1, true, sSeparator, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats a float with thousand separators and decimals (e.g. 15000.5 -> "15.000,50")
	static string FormatThousands(float fValue, int iDecimals = 2, string sGroupingSeparator = ".", string sDecimalSeparator = ",")
	{
		return FormatFloat(fValue, iDecimals, 1, true, sGroupingSeparator, sDecimalSeparator, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Quick helper: Formats an integer with leading zeroes (e.g. 5, 2 -> "05" or 7, 3 -> "007")
	static string FormatLeadingZeroes(int iValue, int iDigits)
	{
		return FormatInt(iValue, iDigits, false, "", false);
	}
};
