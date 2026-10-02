// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_NetworkEnums.c
// Author: Indy & AI Assistant
// Description: Network enumerations for BPR client-server communication.
// ============================================================================

enum BPR_ENetworkMessageType
{
	NONE = 0,
	MISSION_STATE_UPDATE,
	NOTIFICATION_POPUP,
	PLAYER_DATA_SYNC,
	SOUND_TRIGGER,
	CUSTOM_EVENT,
	REQUEST_SERVER_CONFIG,
	RESPONSE_SERVER_CONFIG,
	REQUEST_SAVE_CONFIG,
	RESPONSE_SAVE_CONFIG,
	CONFIRM_START_MISSION
};

enum BPR_EMissionLoadingState
{
	INACTIVE = 0,
	LOADING,
	FINISHED
};

enum BPR_EOpenMeteoStatus
{
	UNKNOWN = 0,
	AVAILABLE,
	CLI_PARAM_MISSING,
	REST_DISABLED,
	TIMEOUT_FIREWALL,
	API_ERROR
};
