// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_TimeAndWeatherManagerEntity.c
// Author: Indy & AI Assistant
// Description: Central helper class to retrieve TimeAndWeatherManagerEntity
//              via ChimeraWorld.CastFrom(baseWorld).
//
// USAGE:
// ----------------------------------------------------------------------------
// m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
// m_pTimeMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
// ============================================================================

class BPR_TimeAndWeatherManagerEntity
{
	const static string CALLER_ID = "TiWeMag";

	//------------------------------------------------------------------------------------------------
	//! Static method to obtain the TimeAndWeatherManagerEntity safely from the game world
	static TimeAndWeatherManagerEntity GetTimeAndWeatherManager(string sCaller = "", bool bSilent = false)
	{
		if (sCaller == "")
			sCaller = CALLER_ID;

		ArmaReforgerScripted pGame = GetGame();
		if (!pGame)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: Game instance could not be determined!");
			return null;
		}

		BaseWorld pBaseWorld = pGame.GetWorld();
		if (!pBaseWorld)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: Base world could not be determined!");
			return null;
		}

		// Conversion into ChimeraWorld interface required for simulation (CastFrom)
		ChimeraWorld pChimeraWorld = ChimeraWorld.CastFrom(pBaseWorld);
		if (!pChimeraWorld)
		{
			if (!bSilent)
				DebugLog.Err(sCaller, "TimeAndWeatherManager: World is not a valid ChimeraWorld!");
			return null;
		}

		// Retrieve TimeAndWeatherManager
		TimeAndWeatherManagerEntity pTimeAndWeatherManager = pChimeraWorld.GetTimeAndWeatherManager();
		if (pTimeAndWeatherManager)
		{
			DebugLog.Info(sCaller, "TimeAndWeatherManager successfully retrieved.");
			return pTimeAndWeatherManager;
		}

		if (!bSilent)
			DebugLog.Err(sCaller, "TimeAndWeatherManager not found on the map!");

		return null;
	}
};
