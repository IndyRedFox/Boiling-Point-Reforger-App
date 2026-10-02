// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_FetchOpenMeteoData.c
// Author: Indy & AI Assistant
// Description: Central service for Open-Meteo REST API communication.
//              - Checks startup parameters (-restapi) and RestApi availability.
//              - Executes pre-flight ping during loading sequence.
//              - Fetches 48-hour (2-day) weather forecasts with 15-minute resolution:
//                Temperature, Precipitation, Wind (speed/dir/gusts), WMO Weather Code,
//                Humidity, Surface Pressure, and Visibility.
//              - Interpolates hourly cloud cover into synchronized 15-minute intervals.
//              - Autonomous loop with 60-minute refresh interval.
//              - Intelligent retry ladder on network failure (1m -> 3m -> 5m -> 15m).
//              - Thread-safe data getters for WeatherManager and TemperatureManager.
// ============================================================================

// ============================================================================
// JSON Data Structs (Enfusion Engine JsonApiStruct)
// ============================================================================

class BPR_OpenMeteoMinutely15Payload : JsonApiStruct
{
	ref array<string> time;
	ref array<float> temperature_2m;
	ref array<float> relative_humidity_2m;
	ref array<float> precipitation;
	ref array<int> weather_code;
	ref array<float> surface_pressure;
	ref array<float> visibility;
	ref array<float> wind_speed_10m;
	ref array<float> wind_direction_10m;
	ref array<float> wind_gusts_10m;

	void BPR_OpenMeteoMinutely15Payload()
	{
		time = new array<string>();
		temperature_2m = new array<float>();
		relative_humidity_2m = new array<float>();
		precipitation = new array<float>();
		weather_code = new array<int>();
		surface_pressure = new array<float>();
		visibility = new array<float>();
		wind_speed_10m = new array<float>();
		wind_direction_10m = new array<float>();
		wind_gusts_10m = new array<float>();

		RegV("time");
		RegV("temperature_2m");
		RegV("relative_humidity_2m");
		RegV("precipitation");
		RegV("weather_code");
		RegV("surface_pressure");
		RegV("visibility");
		RegV("wind_speed_10m");
		RegV("wind_direction_10m");
		RegV("wind_gusts_10m");
	}
};

class BPR_OpenMeteoHourlyPayload : JsonApiStruct
{
	ref array<string> time;
	ref array<float> cloud_cover;

	void BPR_OpenMeteoHourlyPayload()
	{
		time = new array<string>();
		cloud_cover = new array<float>();

		RegV("time");
		RegV("cloud_cover");
	}
};

class BPR_OpenMeteoForecastResponse : JsonApiStruct
{
	ref BPR_OpenMeteoMinutely15Payload minutely_15;
	ref BPR_OpenMeteoHourlyPayload hourly;

	void BPR_OpenMeteoForecastResponse()
	{
		minutely_15 = new BPR_OpenMeteoMinutely15Payload();
		hourly = new BPR_OpenMeteoHourlyPayload();

		RegV("minutely_15");
		RegV("hourly");
	}
};

// ============================================================================
// REST Callbacks
// ============================================================================

//------------------------------------------------------------------------------------------------
//! Internal callback to process asynchronous REST ping response
class BPR_OpenMeteoCheckCallback : RestCallback
{
	protected BPR_FetchOpenMeteoData m_pService;

	void BPR_OpenMeteoCheckCallback(BPR_FetchOpenMeteoData pService)
	{
		m_pService = pService;
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (m_pService)
			m_pService.OnCheckSuccess(data, dataSize);
	}

	override void OnError(int errorCode)
	{
		if (m_pService)
			m_pService.OnCheckError(errorCode);
	}

	override void OnTimeout()
	{
		if (m_pService)
			m_pService.OnCheckTimeout();
	}
};

//------------------------------------------------------------------------------------------------
//! Internal callback to process asynchronous 48h weather forecast response
class BPR_OpenMeteoDataCallback : RestCallback
{
	protected BPR_FetchOpenMeteoData m_pService;

	void BPR_OpenMeteoDataCallback(BPR_FetchOpenMeteoData pService)
	{
		m_pService = pService;
	}

	override void OnSuccess(string data, int dataSize)
	{
		if (m_pService)
			m_pService.OnDataSuccess(data, dataSize);
	}

	override void OnError(int errorCode)
	{
		if (m_pService)
			m_pService.OnDataError(errorCode);
	}

	override void OnTimeout()
	{
		if (m_pService)
			m_pService.OnDataTimeout();
	}
};

// ============================================================================
// Central Service Class
// ============================================================================

class BPR_FetchOpenMeteoData
{
	const static string CALLER_ID = "FetchOM";
	const static string BASE_URL = "https://api.open-meteo.com/";
	const static string PING_ENDPOINT = "v1/forecast?latitude=0&longitude=0&current=temperature_2m";

	// Timing constants (in milliseconds)
	const static int INTERVAL_NORMAL_MS  = 3600000; // 60 minutes
	const static int RETRY_STEP_1_MS     = 60000;   // 1 minute
	const static int RETRY_STEP_2_MS     = 180000;  // 3 minutes
	const static int RETRY_STEP_3_MS     = 300000;  // 5 minutes
	const static int RETRY_STEP_4_MS     = 900000;  // 15 minutes
	const static int SAFETY_TIMEOUT_DATA_MS = 4000; // 4.0 seconds

	protected static ref BPR_FetchOpenMeteoData s_pInstance;

	// Pre-flight check state
	protected BPR_EOpenMeteoStatus m_eStatus = BPR_EOpenMeteoStatus.UNKNOWN;
	protected string m_sDiagnosticMessage = "Verbindungspruefung ausstehend.";
	protected bool m_bIsCheckComplete = false;
	protected bool m_bIsCheckRunning = false;
	protected ref ScriptInvoker m_OnCheckFinished;
	protected ref BPR_OpenMeteoCheckCallback m_pCheckCallback;

	// Forecast data state
	protected bool m_bIsFetching = false;
	protected bool m_bHasValidData = false;
	protected int m_iRetryStep = 0;
	protected float m_fActiveLat = 0.0;
	protected float m_fActiveLon = 0.0;
	protected string m_sActiveSource = "";
	protected ref ScriptInvoker m_OnWeatherDataUpdated;
	protected ref BPR_OpenMeteoDataCallback m_pDataCallback;

	// Synchronized 15-Minute Data Arrays (192 values for 48 hours)
	protected ref array<string> m_aTimes;
	protected ref array<float>  m_aTemperatures;
	protected ref array<float>  m_aRelativeHumidity;
	protected ref array<float>  m_aPrecipitations;
	protected ref array<int>    m_aWeatherCodes;
	protected ref array<float>  m_aSurfacePressure;
	protected ref array<float>  m_aVisibility;
	protected ref array<float>  m_aWindSpeeds;
	protected ref array<float>  m_aWindDirections;
	protected ref array<float>  m_aWindGusts;
	protected ref array<float>  m_aCloudCover; // Interpolated from hourly to 15-min

	//------------------------------------------------------------------------------------------------
	//! Constructor
	void BPR_FetchOpenMeteoData()
	{
		m_OnCheckFinished = new ScriptInvoker();
		m_OnWeatherDataUpdated = new ScriptInvoker();

		m_aTimes = new array<string>();
		m_aTemperatures = new array<float>();
		m_aRelativeHumidity = new array<float>();
		m_aPrecipitations = new array<float>();
		m_aWeatherCodes = new array<int>();
		m_aSurfacePressure = new array<float>();
		m_aVisibility = new array<float>();
		m_aWindSpeeds = new array<float>();
		m_aWindDirections = new array<float>();
		m_aWindGusts = new array<float>();
		m_aCloudCover = new array<float>();
	}

	//------------------------------------------------------------------------------------------------
	//! Returns singleton instance
	static BPR_FetchOpenMeteoData GetInstance()
	{
		if (!s_pInstance)
			s_pInstance = new BPR_FetchOpenMeteoData();

		return s_pInstance;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired when connectivity check finishes
	ScriptInvoker GetOnCheckFinished()
	{
		return m_OnCheckFinished;
	}

	//------------------------------------------------------------------------------------------------
	//! ScriptInvoker event fired when weather forecast updates (passes bool bSuccess)
	ScriptInvoker GetOnWeatherDataUpdated()
	{
		return m_OnWeatherDataUpdated;
	}

	// ===============================================================================================
	// PRE-FLIGHT CONNECTIVITY CHECK
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Checks universal CLI parameters for REST API permissions
	protected bool CheckCLIParam()
	{
		string sParamValue = "";

		bool bFound = System.GetCLIParam("restapi", sParamValue);
		if (!bFound)
			bFound = System.GetCLIParam("-restapi", sParamValue);

		if (!bFound)
		{
			if (System.IsCLIParam("restapi") || System.IsCLIParam("-restapi"))
				return true;

			return false;
		}

		if (sParamValue == "" || sParamValue == "*" || sParamValue.Contains("*"))
			return true;

		if (sParamValue.Contains("open-meteo.com"))
			return true;

		return false;
	}

	//------------------------------------------------------------------------------------------------
	//! Starts asynchronous connectivity pre-flight check
	void StartConnectivityCheck()
	{
		if (m_bIsCheckRunning)
			return;

		m_bIsCheckRunning = true;
		m_bIsCheckComplete = false;
		m_eStatus = BPR_EOpenMeteoStatus.UNKNOWN;
		DebugLog.Info(CALLER_ID, "Starte Open-Meteo Pre-Flight-Pruefung...");

		if (!CheckCLIParam())
		{
			CompleteCheck(BPR_EOpenMeteoStatus.CLI_PARAM_MISSING, "Startoption '-restapi=api.open-meteo.com' oder '-restapi=*' fehlt.");
			return;
		}

		RestApi pRestApi = GetGame().GetRestApi();
		if (!pRestApi)
		{
			CompleteCheck(BPR_EOpenMeteoStatus.REST_DISABLED, "Engine-REST-Subsystem ist auf diesem Server nicht verfuegbar.");
			return;
		}

		RestContext pContext = pRestApi.GetContext(BASE_URL);
		if (!pContext)
		{
			CompleteCheck(BPR_EOpenMeteoStatus.REST_DISABLED, "Konnte keinen REST-Context fuer api.open-meteo.com erstellen.");
			return;
		}

		m_pCheckCallback = new BPR_OpenMeteoCheckCallback(this);
		pContext.GET(m_pCheckCallback, PING_ENDPOINT);

		GetGame().GetCallqueue().CallLater(OnCheckSafetyTimeout, 2000, false);
	}

	void OnCheckSuccess(string sData, int iDataSize)
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);

		if (iDataSize > 0)
			CompleteCheck(BPR_EOpenMeteoStatus.AVAILABLE, "Verbindung zu Open-Meteo erfolgreich hergestellt.");
		else
			CompleteCheck(BPR_EOpenMeteoStatus.API_ERROR, "Open-Meteo antwortete mit leerem Datenpaket.");
	}

	void OnCheckError(int iErrorCode)
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);
		CompleteCheck(BPR_EOpenMeteoStatus.API_ERROR, string.Format("Netzwerkfehler (Code: %1) bei Verbindung zu Open-Meteo.", iErrorCode));
	}

	void OnCheckTimeout()
	{
		GetGame().GetCallqueue().Remove(OnCheckSafetyTimeout);
		CompleteCheck(BPR_EOpenMeteoStatus.TIMEOUT_FIREWALL, "Zeitueberschreitung: Keine Antwort von Open-Meteo (Firewall oder DNS-Sperre).");
	}

	protected void OnCheckSafetyTimeout()
	{
		if (!m_bIsCheckComplete)
			CompleteCheck(BPR_EOpenMeteoStatus.TIMEOUT_FIREWALL, "Sicherheits-Timeout erreicht (keine Antwort vom Server).");
	}

	protected void CompleteCheck(BPR_EOpenMeteoStatus eStatus, string sDiagnostic)
	{
		m_bIsCheckRunning = false;
		m_bIsCheckComplete = true;
		m_eStatus = eStatus;
		m_sDiagnosticMessage = sDiagnostic;

		bool bIsAvailable = (eStatus == BPR_EOpenMeteoStatus.AVAILABLE);
		DebugLog.Info(CALLER_ID, string.Format("Pre-Flight abgeschlossen. Status: %1 (%2). Diagnose: %3", typename.EnumToString(BPR_EOpenMeteoStatus, eStatus), bIsAvailable, sDiagnostic));

		if (m_OnCheckFinished)
		{
			m_OnCheckFinished.Invoke(bIsAvailable, eStatus, sDiagnostic);
			m_OnCheckFinished.Clear();
		}
	}

	// ===============================================================================================
	// 48-HOUR WEATHER FORECAST RETRIEVAL & RETRY LADDER
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Public entry to start the periodic 48h weather forecast loop.
	//! Called by MissionLoadingManager once Weather Mode 3 or 4 is confirmed.
	void StartFetching(float fLat = 999.0, float fLon = 999.0)
	{
		if (fLat == 999.0 || fLon == 999.0)
		{
			BPR_MapUtility.GetOverrideCoordinates(m_fActiveLat, m_fActiveLon, m_sActiveSource);
		}
		else
		{
			m_fActiveLat = fLat;
			m_fActiveLon = fLon;
			m_sActiveSource = "ProvidedCoordinates";
		}

		m_iRetryStep = 0;
		DebugLog.Info(CALLER_ID, string.Format("Starte Wetter-Abfrage-Loop fuer Koordinaten: %1, %2 (%3)", m_fActiveLat, m_fActiveLon, m_sActiveSource));

		FetchWeatherData();
	}

	//------------------------------------------------------------------------------------------------
	//! Dispatches the asynchronous GET request to Open-Meteo
	void FetchWeatherData()
	{
		if (m_bIsFetching)
			return;

		RestApi pRestApi = GetGame().GetRestApi();
		if (!pRestApi)
		{
			DebugLog.Warn(CALLER_ID, "RestApi nicht verfuegbar. Plane erneuten Versuch.");
			ScheduleRetry();
			return;
		}

		RestContext pContext = pRestApi.GetContext(BASE_URL);
		if (!pContext)
		{
			DebugLog.Warn(CALLER_ID, "RestContext fuer api.open-meteo.com fehlgeschlagen.");
			ScheduleRetry();
			return;
		}

		m_bIsFetching = true;

		// Format coordinates with period separator
		string sLatStr = BPR_FormatNumber.FormatFloat(m_fActiveLat, 4, 1, false, "", ".");
		string sLonStr = BPR_FormatNumber.FormatFloat(m_fActiveLon, 4, 1, false, "", ".");

		string sEndpoint = string.Format("v1/forecast?latitude=%1&longitude=%2&minutely_15=temperature_2m,relative_humidity_2m,precipitation,weather_code,surface_pressure,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=cloud_cover&forecast_days=2", sLatStr, sLonStr);

		m_pDataCallback = new BPR_OpenMeteoDataCallback(this);
		pContext.GET(m_pDataCallback, sEndpoint);

		// Safety timeout
		GetGame().GetCallqueue().CallLater(OnDataSafetyTimeout, SAFETY_TIMEOUT_DATA_MS, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Success callback from RestCallback
	void OnDataSuccess(string sData, int iDataSize)
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;

		if (iDataSize <= 0 || sData == "")
		{
			DebugLog.Warn(CALLER_ID, "Open-Meteo Datenpaket ist leer.");
			ScheduleRetry();
			return;
		}

		ref BPR_OpenMeteoForecastResponse pResponse = new BPR_OpenMeteoForecastResponse();
		pResponse.ExpandFromRAW(sData);

		if (!pResponse.minutely_15 || !pResponse.minutely_15.time || pResponse.minutely_15.time.IsEmpty())
		{
			DebugLog.Warn(CALLER_ID, "Fehler beim Deserialisieren oder keine minutely_15 Wetterdaten im JSON vorhanden.");
			ScheduleRetry();
			return;
		}

		// Store parsed 15-minute arrays
		m_aTimes.Copy(pResponse.minutely_15.time);
		m_aTemperatures.Copy(pResponse.minutely_15.temperature_2m);
		m_aRelativeHumidity.Copy(pResponse.minutely_15.relative_humidity_2m);
		m_aPrecipitations.Copy(pResponse.minutely_15.precipitation);
		m_aWeatherCodes.Copy(pResponse.minutely_15.weather_code);
		m_aSurfacePressure.Copy(pResponse.minutely_15.surface_pressure);
		m_aVisibility.Copy(pResponse.minutely_15.visibility);
		m_aWindSpeeds.Copy(pResponse.minutely_15.wind_speed_10m);
		m_aWindDirections.Copy(pResponse.minutely_15.wind_direction_10m);
		m_aWindGusts.Copy(pResponse.minutely_15.wind_gusts_10m);

		int iTargetCount = m_aTimes.Count();

		// Interpolate hourly cloud cover into 15-minute array
		if (pResponse.hourly && !pResponse.hourly.cloud_cover.IsEmpty())
		{
			InterpolateHourlyCloudCover(pResponse.hourly.cloud_cover, iTargetCount);
		}
		else
		{
			m_aCloudCover.Clear();
			for (int i = 0; i < iTargetCount; i++)
				m_aCloudCover.Insert(0.0);
		}

		m_bHasValidData = true;
		m_iRetryStep = 0; // Reset retry ladder on success

		DebugLog.Info(CALLER_ID, string.Format("Wetterdaten erfolgreich aktualisiert: %1 Intervalle geladen. Aktuell: %2°C, Wettercode: %3, Wolken: %4%%",
			iTargetCount, m_aTemperatures[0], m_aWeatherCodes[0], m_aCloudCover[0]));

		if (m_OnWeatherDataUpdated)
			m_OnWeatherDataUpdated.Invoke(true);

		// Schedule next regular update in 60 minutes
		GetGame().GetCallqueue().Remove(FetchWeatherData);
		GetGame().GetCallqueue().CallLater(FetchWeatherData, INTERVAL_NORMAL_MS, false);
	}

	//------------------------------------------------------------------------------------------------
	//! Error callback from RestCallback
	void OnDataError(int iErrorCode)
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, string.Format("Netzwerkfehler beim Abrufen der Wetterdaten (Code: %1).", iErrorCode));
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Timeout callback from RestCallback
	void OnDataTimeout()
	{
		GetGame().GetCallqueue().Remove(OnDataSafetyTimeout);
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, "Timeout beim Abrufen der Wetterdaten von Open-Meteo.");
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Safety timeout if engine hangs
	protected void OnDataSafetyTimeout()
	{
		m_bIsFetching = false;
		DebugLog.Warn(CALLER_ID, "Sicherheits-Timeout bei Open-Meteo Datenabfrage erreicht.");
		ScheduleRetry();
	}

	//------------------------------------------------------------------------------------------------
	//! Intelligent Retry Ladder: 1 min -> 3 min -> 5 min -> 15 min (repeats at 15 min)
	protected void ScheduleRetry()
	{
		int iDelayMs = RETRY_STEP_1_MS; // 1 min

		if (m_iRetryStep == 1)
			iDelayMs = RETRY_STEP_2_MS; // 3 min
		else if (m_iRetryStep == 2)
			iDelayMs = RETRY_STEP_3_MS; // 5 min
		else if (m_iRetryStep >= 3)
			iDelayMs = RETRY_STEP_4_MS; // 15 min

		int iNextStep = m_iRetryStep + 1;
		if (iNextStep > 3)
			iNextStep = 3;

		m_iRetryStep = iNextStep;

		int iDelayMinutes = Math.Round(iDelayMs / 60000.0);
		DebugLog.Info(CALLER_ID, string.Format("Wiederholungsversuch (Stufe %1) in %2 Minuten angesetzt.", m_iRetryStep, iDelayMinutes));

		GetGame().GetCallqueue().Remove(FetchWeatherData);
		GetGame().GetCallqueue().CallLater(FetchWeatherData, iDelayMs, false);

		if (!m_bHasValidData && m_OnWeatherDataUpdated)
			m_OnWeatherDataUpdated.Invoke(false);
	}

	//------------------------------------------------------------------------------------------------
	//! Interpolates 48 hourly cloud cover values into 192 synchronized 15-minute values
	protected void InterpolateHourlyCloudCover(array<float> aHourlyClouds, int iTargetCount)
	{
		m_aCloudCover.Clear();

		if (!aHourlyClouds || aHourlyClouds.IsEmpty())
			return;

		int iHourCount = aHourlyClouds.Count();

		for (int iHour = 0; iHour < iHourCount; iHour++)
		{
			float fCurrentCloud = aHourlyClouds[iHour];
			float fNextCloud = fCurrentCloud;

			if (iHour + 1 < iHourCount)
				fNextCloud = aHourlyClouds[iHour + 1];

			for (int iStep = 0; iStep < 4; iStep++)
			{
				if (m_aCloudCover.Count() >= iTargetCount)
					break;

				float fT = iStep * 0.25;
				float fInterpolated = fCurrentCloud + ((fNextCloud - fCurrentCloud) * fT);
				float fRounded = Math.Clamp(Math.Round(fInterpolated * 10.0) * 0.1, 0.0, 100.0);
				m_aCloudCover.Insert(fRounded);
			}

			if (m_aCloudCover.Count() >= iTargetCount)
				break;
		}

		while (m_aCloudCover.Count() < iTargetCount)
		{
			m_aCloudCover.Insert(aHourlyClouds[iHourCount - 1]);
		}
	}

	// ===============================================================================================
	// GETTERS FOR WEATHER & TEMPERATURE MANAGERS
	// ===============================================================================================

	//------------------------------------------------------------------------------------------------
	//! Returns true if valid 48-hour forecast data is stored in memory
	static bool HasValidData()
	{
		if (!s_pInstance)
			return false;

		return s_pInstance.m_bHasValidData;
	}

	//------------------------------------------------------------------------------------------------
	//! Returns the number of available 15-minute intervals (normally 192 for 48 hours)
	static int GetDataCount()
	{
		if (!s_pInstance || !s_pInstance.m_bHasValidData)
			return 0;

		return s_pInstance.m_aTimes.Count();
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves all weather parameters for a specific interval index (0 to 191)
	static bool GetWeatherInterval(int iIndex, out float fTemp, out float fPrecip, out float fWindSpeed, out float fWindDir, out float fWindGust, out int iWeatherCode, out float fCloudCover, out float fHumidity, out float fVisibility, out float fPressure)
	{
		fTemp = 0.0;
		fPrecip = 0.0;
		fWindSpeed = 0.0;
		fWindDir = 0.0;
		fWindGust = 0.0;
		iWeatherCode = 0;
		fCloudCover = 0.0;
		fHumidity = 0.0;
		fVisibility = 10000.0;
		fPressure = 1013.25;

		if (!s_pInstance || !s_pInstance.m_bHasValidData)
			return false;

		if (iIndex < 0 || iIndex >= s_pInstance.m_aTimes.Count())
			return false;

		fTemp = s_pInstance.m_aTemperatures[iIndex];
		fPrecip = s_pInstance.m_aPrecipitations[iIndex];
		fWindSpeed = s_pInstance.m_aWindSpeeds[iIndex];
		fWindDir = s_pInstance.m_aWindDirections[iIndex];
		fWindGust = s_pInstance.m_aWindGusts[iIndex];
		iWeatherCode = s_pInstance.m_aWeatherCodes[iIndex];
		fCloudCover = s_pInstance.m_aCloudCover[iIndex];
		fHumidity = s_pInstance.m_aRelativeHumidity[iIndex];
		fVisibility = s_pInstance.m_aVisibility[iIndex];
		fPressure = s_pInstance.m_aSurfacePressure[iIndex];

		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Retrieves weather parameters for a specific in-game time:
	//! iDayIndex: 0 (today) or 1 (tomorrow)
	//! iHour: 0 to 23
	//! iMinute: 0 to 59
	static bool GetWeatherAtTime(int iDayIndex, int iHour, int iMinute, out float fTemp, out float fPrecip, out float fWindSpeed, out float fWindDir, out float fWindGust, out int iWeatherCode, out float fCloudCover, out float fHumidity, out float fVisibility, out float fPressure)
	{
		int iClampedDay = Math.Clamp(iDayIndex, 0, 1);
		int iClampedHour = Math.Clamp(iHour, 0, 23);
		int iClampedMinute = Math.Clamp(iMinute, 0, 59);

		int iInterval = (iClampedDay * 96) + (iClampedHour * 4) + (iClampedMinute / 15);
		return GetWeatherInterval(iInterval, fTemp, fPrecip, fWindSpeed, fWindDir, fWindGust, iWeatherCode, fCloudCover, fHumidity, fVisibility, fPressure);
	}

	// Direct Array Getters
	array<string> GetTimes()            { return m_aTimes; }
	array<float>  GetTemperatures()     { return m_aTemperatures; }
	array<float>  GetRelativeHumidity() { return m_aRelativeHumidity; }
	array<float>  GetPrecipitations()   { return m_aPrecipitations; }
	array<int>    GetWeatherCodes()     { return m_aWeatherCodes; }
	array<float>  GetSurfacePressure()  { return m_aSurfacePressure; }
	array<float>  GetVisibility()       { return m_aVisibility; }
	array<float>  GetWindSpeeds()       { return m_aWindSpeeds; }
	array<float>  GetWindDirections()   { return m_aWindDirections; }
	array<float>  GetWindGusts()        { return m_aWindGusts; }
	array<float>  GetCloudCover()       { return m_aCloudCover; }

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns whether Open-Meteo is verified and available
	static bool IsAvailable()
	{
		if (!s_pInstance)
			return false;

		return (s_pInstance.m_eStatus == BPR_EOpenMeteoStatus.AVAILABLE);
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns current status enum
	static BPR_EOpenMeteoStatus GetStatus()
	{
		if (!s_pInstance)
			return BPR_EOpenMeteoStatus.UNKNOWN;

		return s_pInstance.m_eStatus;
	}

	//------------------------------------------------------------------------------------------------
	//! Static helper: Returns diagnostic message string
	static string GetDiagnosticNotice()
	{
		if (!s_pInstance)
			return "Nicht geprueft.";

		return s_pInstance.m_sDiagnosticMessage;
	}

	//------------------------------------------------------------------------------------------------
	//! Resets singleton instance and status (for mission restart / cleanup)
	static void Reset()
	{
		if (s_pInstance)
		{
			GetGame().GetCallqueue().Remove(s_pInstance.OnCheckSafetyTimeout);
			GetGame().GetCallqueue().Remove(s_pInstance.OnDataSafetyTimeout);
			GetGame().GetCallqueue().Remove(s_pInstance.FetchWeatherData);

			if (s_pInstance.m_OnCheckFinished)
				s_pInstance.m_OnCheckFinished.Clear();

			if (s_pInstance.m_OnWeatherDataUpdated)
				s_pInstance.m_OnWeatherDataUpdated.Clear();

			s_pInstance = null;
		}
	}
};
