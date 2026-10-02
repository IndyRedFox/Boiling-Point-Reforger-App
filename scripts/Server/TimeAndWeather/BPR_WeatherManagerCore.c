// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_WeatherManagerCore.c
// Author: Indy & AI Assistant
// Description: Server-side Weather Manager Core class (Caller: WeMaCore).
//              Validates weather configuration parameters and coordinates
//              the appropriate specialized Weather Manager (Simple, System, OpenMeteo).
// ============================================================================

class BPR_WeatherManagerCore
{
	const static string CALLER_ID = "WeMaCore";

	protected bool m_bIsInitialized;
	protected int m_iWeatherMode;
	protected string m_sStartWeatherState;
	protected ref array<string> m_aWeatherTypes = {"Clear", "Cloudy", "Overcast", "Rainy"};
	protected int m_iWeatherTransition;
	protected int m_iTransitionTime;
	
	protected TimeAndWeatherManagerEntity m_pWeatherMgr;
	protected ref BPR_WeatherProviderSimple m_pWeatherProviderSimple;
	protected ref BPR_WeatherProviderSystem m_pWeatherProviderSystem;
	protected ref BPR_WeatherProviderOpenMeteo m_pWeatherProviderOpenMeteo;
	
	//------------------------------------------------------------------------------------------------
	//! Initializes Weather Manager Core and dispatches to the selected weather subsystem
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;

		// Get TimeAndWeatherManagerEntity
		m_pWeatherMgr = BPR_TimeAndWeatherManagerEntity.GetTimeAndWeatherManager(CALLER_ID);
		if (!m_pWeatherMgr)
		{
			DebugLog.Err(CALLER_ID, "TimeAndWeatherManagerEntity not found! Weather simulation cannot be initialized.");
			return;
		}

		// Load Server Configuration
		BPR_ServerConfig pConfig = BPR_JsonConfigHandler.GetConfig();
		if (!pConfig)
		{
			DebugLog.Err(CALLER_ID, "ServerConfig is null! Using default weather settings.");
			pConfig = new BPR_ServerConfig();
		}

		//------------------------------------------------------------------------------------------------
		// Validate Parameters
		// WeatherMode (1-4, default 1)
		int iWeatherMode = pConfig.iWeatherMode;
			
		if (iWeatherMode < 1 || iWeatherMode > 4)
		{
			DebugLog.Warn(CALLER_ID, string.Format("Invalid WeatherMode (%1) in config (Must be 1-4). Defaulting to 1 (System Weather).", iWeatherMode));
			iWeatherMode = 1;
		}
		m_iWeatherMode = iWeatherMode;
		
		// -----------------------------------------------------
		// Startweather, Transition and Transitiontime for WeatherMode 1 + 2
		if (m_iWeatherMode == 1 || m_iWeatherMode == 2)
		{
			// StartWeatherID (0-4, default 0)
			int iStartWeatherID = pConfig.iStartWeather;	
					
			if (iStartWeatherID < 0 || iStartWeatherID > 4)
			{
				DebugLog.Warn(CALLER_ID, string.Format("Invalid StartWeatherID (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iStartWeatherID));
				iStartWeatherID = 0;
			}
			if (iStartWeatherID == 0)
			{
				iStartWeatherID = Math.RandomIntInclusive(1, 4);
				DebugLog.Info(CALLER_ID, string.Format("Random StartWeatherID (%1).", iStartWeatherID));
			}
			else
			{
				DebugLog.Info(CALLER_ID, string.Format("Selected StartWeatherID (%1).", iStartWeatherID));
			}
			
			// Transition StartWeatherID to StartWeatherState
			m_sStartWeatherState = "Clear";
			
			if (iStartWeatherID >= 1 && iStartWeatherID <= m_aWeatherTypes.Count())
			{
				int index = iStartWeatherID - 1;
				
				m_sStartWeatherState = m_aWeatherTypes[index];
				DebugLog.Info(CALLER_ID, string.Format("StartWeather selected: %1.", m_sStartWeatherState));
			}			
			else
			{
				DebugLog.Warn(CALLER_ID, string.Format("Wrong index for WeatherState array. Default State used 'Clear'."));
			}			
			
			if (m_sStartWeatherState == "")
			{
				m_sStartWeatherState = "Clear";
				DebugLog.Warn(CALLER_ID, string.Format("Missing WeatherState. Default State used 'Clear'."));
			}	
			
			// -----------------------------------------------------
			// Weathertransitions and Transitiontime for Mode 2
			if (m_iWeatherMode == 2)
			{
				int iIndex = 0;
				
				// WeatherTransitions (0-4: 0. Random, 1. Never, 2. 60 min, 3. 30 min, 4. 10 min)
				int iWeatherTransition = pConfig.iWeatherTransitions;
				
				if (iWeatherTransition < 0 || iWeatherTransition > 4)
				{
					DebugLog.Warn(CALLER_ID, string.Format("Invalid WeatherTransition (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iWeatherTransition));
					iWeatherTransition = 0;
				}
				else
				{
					array<string> aWeatherTransitions = {"0. Random", "1. Never", "2. 60 min", "3. 30 min", "4. 10 min"};
					iIndex = iWeatherTransition;
					
					DebugLog.Info(CALLER_ID, string.Format("WeatherTransitions selected: %1.", aWeatherTransitions[iIndex]));
				}
				m_iWeatherTransition = iWeatherTransition;
		
				// TransitionTime (0-4: 0. Random, 1. 30 min, 2. 15 min, 3. 7.5 min, 4. 5 min)
				int iTransitionTime = pConfig.iTransitionTime;
				
				if (iTransitionTime < 0 || iTransitionTime > 4)
				{
					DebugLog.Warn(CALLER_ID, string.Format("Invalid TransitionTime (%1) in config (Must be 0-4). Defaulting to 0 (Random).", iTransitionTime));
					iTransitionTime = 0;
				}
				else
				{
					array<string> aTransitionTime = {"0. Random", "1. 30 min", "2. 15 min", "3. 7.5 min", "4. 5 min"};
					iIndex = iTransitionTime;
					
					DebugLog.Info(CALLER_ID, string.Format("TransitionTime selected: %1.", aTransitionTime[iIndex]));
				}
				m_iTransitionTime = iTransitionTime;	
			}
		}
		
		//------------------------------------------------------------------------------------------------
		// Initialize Selected Weather System
		switch (m_iWeatherMode)
		{
			// Mode 1: System Weather Provider (Default)
			case 1:
			default:
			{
				DebugLog.Info(CALLER_ID, string.Format("Mode 1 (System Weather): Initialized with StartWeather: %1.", m_sStartWeatherState));
				m_pWeatherProviderSystem = new BPR_WeatherProviderSystem();
				m_pWeatherProviderSystem.Init(m_sStartWeatherState);		
			}
			break;
			
			// Mode 2: Simple Weather Provider
			case 2:
			{
				DebugLog.Info(CALLER_ID, string.Format("Mode 2 (Simple Weather): Initialized with StartWeather: %1.", m_sStartWeatherState));
				m_pWeatherProviderSimple = new BPR_WeatherProviderSimple();
				m_pWeatherProviderSimple.Init(m_sStartWeatherState, m_iWeatherTransition, m_iTransitionTime);
			}
			break;
			
			// Mode 3 + 4: Weather via Coordinates (Open-Meteo)
			case 3:
			case 4:
			{
				float fLatitude = 50.073;
				float fLongitude = 14.437;
				string sSource;
				
				// Mode 3: Map Weather via map Coordinates (Open-Meteo)
				if (m_iWeatherMode == 3)
				{
					string sMapName;
					float fMapLatitude, fMapLongitude;
				
					bool bMapname = BPR_MapUtility.GetMapName(sMapName);
					bool bOverrideCoordinates = BPR_MapUtility.GetMapCoordinates(fMapLatitude, fMapLongitude, sSource);
									
					string sCoordinates = BPR_MapUtility.FormatCoordinates(fMapLatitude, fMapLongitude);
					string sLowerSource = sSource;	
					sLowerSource.ToLower();
					
					fLatitude = fMapLatitude;
					fLongitude = fMapLongitude;
					
					// Override map location
					if (sLowerSource.Contains("override"))
					{
						string sOverrideLocation = BPR_VariablesConfig.OVERRIDE_LOCATION;
						
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Override coordinates (%1) found, using location %2 for %3.", sCoordinates, sOverrideLocation, sMapName));
					}
					// Original map location
					else if (sLowerSource.Contains("original"))
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Using map coordinates (%1) for %2.", sCoordinates, sMapName));
					}
					// Fallback location Bohemia HQ
					else
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 3 (Map Weather): Incorrect coordinates. Using fallback location Bohemia HQ (%1).", sCoordinates));
					}
				}
				
				// Mode 4: User Weather via Coordinates (Open-Meteo)
				else
				{
					float fCustomLatitude, fCustomLongitude;
					
					bool bUserCoordinates = BPR_MapUtility.GetUserCoordinates(pConfig.sCoordinates, fCustomLatitude, fCustomLongitude, sSource);
					
					fLatitude = fCustomLatitude;
					fLongitude = fCustomLongitude;
					
					if (sSource == "UserInput")
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 4 (Own Weather): Using coordinates %1.", BPR_MapUtility.FormatCoordinates(fLatitude, fLongitude)));
					}
					else
					{
						DebugLog.Info(CALLER_ID, string.Format("Mode 4 (Own Weather): Wrong user coordinates (%1). Using %2 coordinates (%3)", pConfig.sCoordinates, sSource, BPR_MapUtility.FormatCoordinates(fLatitude, fLongitude)));
					}
				}

				// Start real weather with defined coordinates
				m_pWeatherProviderOpenMeteo = new BPR_WeatherProviderOpenMeteo();
				m_pWeatherProviderOpenMeteo.Init(fLatitude, fLongitude);
			}
			break;
		}
	}

	//------------------------------------------------------------------------------------------------
	//! Cleans up active weather provider and resets core state
	void Cleanup()
	{
		if (m_pWeatherProviderSimple)
		{
			m_pWeatherProviderSimple.Cleanup();
			m_pWeatherProviderSimple = null;
		}

		m_pWeatherProviderSystem = null;
		if (m_pWeatherProviderOpenMeteo)
		{
			m_pWeatherProviderOpenMeteo.Cleanup();
			m_pWeatherProviderOpenMeteo = null;
		}
		m_bIsInitialized = false;
	}
};
