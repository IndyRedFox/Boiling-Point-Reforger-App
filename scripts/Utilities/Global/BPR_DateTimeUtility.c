// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_DateTimeUtility.c
// Author: Indy & AI Assistant
// Description: Global utility class for date and time parsing, validation,
//              and formatting. Validates leap years, days per month,
//              hours, minutes, seconds, and durations.
// ============================================================================

class BPR_DateTimeUtility
{
	const static string CALLER_ID = "DatTimUti";

	const static int MIN_VALID_YEAR = 1900;
	const static int MAX_VALID_YEAR = 2100;

	//------------------------------------------------------------------------------------------------
	//! Checks if a given year is a leap year (Schaltjahr)
	//! Rule: divisible by 4, but not by 100, unless divisible by 400
	static bool IsLeapYear(int iYear)
	{
		if (iYear <= 0)
			return false;

		return ((iYear % 4 == 0 && iYear % 100 != 0) || (iYear % 400 == 0));
	}

	//------------------------------------------------------------------------------------------------
	//! Returns the maximum number of days in a given month and year
	static int GetDaysInMonth(int iMonth, int iYear)
	{
		if (iMonth < 1 || iMonth > 12)
			return 0;

		switch (iMonth)
		{
			case 1:
			case 3:
			case 5:
			case 7:
			case 8:
			case 10:
			case 12:
				return 31;

			case 4:
			case 6:
			case 9:
			case 11:
				return 30;

			case 2:
				if (IsLeapYear(iYear))
					return 29;
				return 28;
		}

		return 0;
	}

	//------------------------------------------------------------------------------------------------
	//! Formats date components into a padded date string (e.g. 5, 9, 2026 -> "05.09.2026")
	static string FormatDate(int iDay, int iMonth, int iYear, string sSeparator = ".")
	{
		string sDayFormatted = BPR_FormatNumber.FormatLeadingZeroes(iDay, 2);
		string sMonthFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMonth, 2);
		string sYearFormatted = BPR_FormatNumber.FormatLeadingZeroes(iYear, 4);

		return string.Format("%1%2%3%4%5", sDayFormatted, sSeparator, sMonthFormatted, sSeparator, sYearFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats time components into a padded time string (e.g. 14, 5, 9 -> "14:05:09" or 14, 5, -1 -> "14:05")
	static string FormatTime(int iHour, int iMinute, int iSecond = -1, string sSeparator = ":")
	{
		string sHourFormatted = BPR_FormatNumber.FormatLeadingZeroes(iHour, 2);
		string sMinuteFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMinute, 2);

		if (iSecond >= 0)
		{
			string sSecondFormatted = BPR_FormatNumber.FormatLeadingZeroes(iSecond, 2);
			return string.Format("%1%2%3%4%5", sHourFormatted, sSeparator, sMinuteFormatted, sSeparator, sSecondFormatted);
		}

		return string.Format("%1%2%3", sHourFormatted, sSeparator, sMinuteFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats date and time into a combined timestamp string (e.g. "05.09.2026 14:05:00")
	static string FormatDateTime(int iDay, int iMonth, int iYear, int iHour, int iMinute, int iSecond = -1)
	{
		string sDate = FormatDate(iDay, iMonth, iYear);
		string sTime = FormatTime(iHour, iMinute, iSecond);

		return string.Format("%1 %2", sDate, sTime);
	}

	//------------------------------------------------------------------------------------------------
	//! Formats a duration in seconds into MM:SS or HH:MM:SS (e.g. 125 -> "02:05", 3665 -> "01:01:05")
	static string FormatDuration(int iTotalSeconds, bool bIncludeHours = false)
	{
		if (iTotalSeconds < 0)
			iTotalSeconds = 0;

		int iHours = iTotalSeconds / 3600;
		int iMinutes = (iTotalSeconds % 3600) / 60;
		int iSeconds = iTotalSeconds % 60;

		if (bIncludeHours || iHours > 0)
		{
			return FormatTime(iHours, iMinutes, iSeconds);
		}

		string sMinuteFormatted = BPR_FormatNumber.FormatLeadingZeroes(iMinutes, 2);
		string sSecondFormatted = BPR_FormatNumber.FormatLeadingZeroes(iSeconds, 2);
		return string.Format("%1:%2", sMinuteFormatted, sSecondFormatted);
	}

	//------------------------------------------------------------------------------------------------
	//! Parses and validates a date string (dd.mm.yyyy, dd-mm-yyyy or dd/mm/yyyy).
	//! Checks for valid year range, month range, and days per month including leap years.
	//! Returns true if valid, and outputs iDay, iMonth, iYear.
	static bool ParseDate(string sDateString, out int iDay, out int iMonth, out int iYear)
	{
		iDay = 0;
		iMonth = 0;
		iYear = 0;

		if (sDateString == "")
			return false;

		// Detect separator (. or - or /)
		string sSeparator = "";
		if (sDateString.IndexOf(".") != -1)
			sSeparator = ".";
		else if (sDateString.IndexOf("-") != -1)
			sSeparator = "-";
		else if (sDateString.IndexOf("/") != -1)
			sSeparator = "/";
		else
			return false;

		int iFirstSeparator = sDateString.IndexOf(sSeparator);
		if (iFirstSeparator == -1)
			return false;

		string sRemainingDate = sDateString.Substring(iFirstSeparator + 1, sDateString.Length() - (iFirstSeparator + 1));
		int iSecondSeparatorInRemaining = sRemainingDate.IndexOf(sSeparator);
		if (iSecondSeparatorInRemaining == -1)
			return false;

		string sDayPart = sDateString.Substring(0, iFirstSeparator);
		string sMonthPart = sRemainingDate.Substring(0, iSecondSeparatorInRemaining);
		string sYearPart = sRemainingDate.Substring(iSecondSeparatorInRemaining + 1, sRemainingDate.Length() - (iSecondSeparatorInRemaining + 1));

		int iParsedDay = sDayPart.ToInt();
		int iParsedMonth = sMonthPart.ToInt();
		int iParsedYear = sYearPart.ToInt();

		// Validate year range
		if (iParsedYear < MIN_VALID_YEAR || iParsedYear > MAX_VALID_YEAR)
			return false;

		// Validate month range
		if (iParsedMonth < 1 || iParsedMonth > 12)
			return false;

		// Validate days in month (including leap year)
		int iMaxDays = GetDaysInMonth(iParsedMonth, iParsedYear);
		if (iParsedDay < 1 || iParsedDay > iMaxDays)
			return false;

		iDay = iParsedDay;
		iMonth = iParsedMonth;
		iYear = iParsedYear;
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Parses and validates a time string (HH:MM or HH:MM:SS).
	//! Checks for valid hour (0-23), minute (0-59), and second (0-59).
	//! Returns true if valid, and outputs iHour, iMinute, iSecond.
	static bool ParseTime(string sTimeString, out int iHour, out int iMinute, out int iSecond)
	{
		iHour = 0;
		iMinute = 0;
		iSecond = 0;

		if (sTimeString == "")
			return false;

		int iFirstColon = sTimeString.IndexOf(":");
		if (iFirstColon == -1)
			return false;

		string sHourPart = sTimeString.Substring(0, iFirstColon);
		string sRemainingTime = sTimeString.Substring(iFirstColon + 1, sTimeString.Length() - (iFirstColon + 1));
		int iSecondColonInRemaining = sRemainingTime.IndexOf(":");

		string sMinutePart = "";
		string sSecondPart = "0";

		if (iSecondColonInRemaining != -1)
		{
			sMinutePart = sRemainingTime.Substring(0, iSecondColonInRemaining);
			sSecondPart = sRemainingTime.Substring(iSecondColonInRemaining + 1, sRemainingTime.Length() - (iSecondColonInRemaining + 1));
		}
		else
		{
			sMinutePart = sRemainingTime;
		}

		int iParsedHour = sHourPart.ToInt();
		int iParsedMinute = sMinutePart.ToInt();
		int iParsedSecond = sSecondPart.ToInt();

		if (iParsedHour < 0 || iParsedHour > 23)
			return false;

		if (iParsedMinute < 0 || iParsedMinute > 59)
			return false;

		if (iParsedSecond < 0 || iParsedSecond > 59)
			return false;

		iHour = iParsedHour;
		iMinute = iParsedMinute;
		iSecond = iParsedSecond;
		return true;
	}
};
