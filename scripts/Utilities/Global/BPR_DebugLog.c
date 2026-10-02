// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_DebugLog.c
// Author: Indy & AI Assistant
// Description: Global helper class for formatted BPR debug log entries.
//              Outputs logs with "####### DEBUG BPR [Timestamp][Caller] Message".
// ============================================================================

class DebugLog : Managed
{
	const static string PREFIX = "####### DEBUG BPR";
	const static string CALLER_ID = "DebLog";

	//------------------------------------------------------------------------------------------------
	//! Returns the current timestamp (real-time HH:MM:SS) as a string.
	static string GetTimestamp()
	{
		int iHour, iMinute, iSecond;
		System.GetHourMinuteSecond(iHour, iMinute, iSecond);
		
		string sTimeStamp = BPR_DateTimeUtility.FormatTime(iHour, iMinute, iSecond);	

		return string.Format("[%1]", sTimeStamp);
	}

	//------------------------------------------------------------------------------------------------
	//! Log informative message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] Message
	static void Info(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.NORMAL);
	}

	//------------------------------------------------------------------------------------------------
	//! Log warning message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] WARNING Message
	static void Warning(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] WARNING %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.WARNING);
	}

	//! Convenient alias for Warning
	static void Warn(string sCaller, string sMessage)
	{
		Warning(sCaller, sMessage);
	}

	//------------------------------------------------------------------------------------------------
	//! Log error message
	//! Output format: ####### DEBUG BPR [14:25:30] [Caller] ERROR Message
	static void Error(string sCaller, string sMessage)
	{
		string sTimestamp = GetTimestamp();
		Print(string.Format("%1 %2 [%3] ERROR %4", PREFIX, sTimestamp, sCaller, sMessage), LogLevel.ERROR);
	}

	//! Convenient alias for Error
	static void Err(string sCaller, string sMessage)
	{
		Error(sCaller, sMessage);
	}
};
