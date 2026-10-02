// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_VariablesConfig.c
// Author: Indy & AI Assistant
// Description: Definition of general global variables.
// ============================================================================

class BPR_VariablesConfig
{
	const static string CALLER_ID = "VarConf";
		
	const static string MISSION_NAME = "Boiling Point Reforger";
	const static string MISSION_VERSION = "0.1.0";
	
	const static string CONFIG_DIR = "$profile:BoilingPointReforger/";
	
	// Only used when the actual coordinates are useless (e.g. Everon in the middle of the Atlantic)
	// Leave blank if not used.
	const static string OVERRIDE_COORDS = "37.745, -25.699"; 
	const static string OVERRIDE_LOCATION = "Azores";
};
