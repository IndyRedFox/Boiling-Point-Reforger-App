// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: BPR_AudioUtility.c
// Author: Indy & AI Assistant
// Description: Global audio utility class for 2D, 3D and Entity-based sound playback
//              in Enfusion Engine. Provides network broadcast for shared sound events.
// ============================================================================

class BPR_AudioUtility
{
	const static string CALLER_ID = "AudUtil";

	//------------------------------------------------------------------------------------------------
	//! Plays a 2D sound locally on the client (UI, radio, tinnitus, inventory)
	static bool PlaySound2D(string sSoundEvent)
	{
		if (sSoundEvent == "")
			return false;

		AudioSystem.PlaySound(sSoundEvent);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Plays a 3D sound at a fixed world position (e.g. ambient dog barking in distance)
	static bool PlaySoudAtPosition(string sSoundEvent, vector vPosition)
	{
		if (sSoundEvent == "")
			return false;

		AudioHandle pSoundHandle = AudioSystem.PlaySound(sSoundEvent);
		if (!pSoundHandle)
			return false;

		vector vMat[4];
		Math3D.MatrixIdentity4(vMat);
		vMat[3] = vPosition;
		AudioSystem.SetSoundTransformation(pSoundHandle, vMat);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	//! Plays a 3D sound attached to an entity (e.g. coughing player, vehicle horn)
	static bool PlaySoundOnEntity(string sSoundEvent, IEntity pEntity)
	{
		if (!pEntity || sSoundEvent == "")
			return false;

		// If the entity has a SoundComponent, trigger the sound event through it
		SoundComponent pSoundComp = SoundComponent.Cast(pEntity.FindComponent(SoundComponent));
		if (pSoundComp)
		{
			pSoundComp.SoundEvent(sSoundEvent);
			return true;
		}

		// Fallback to playing 3D sound at current entity origin
		return PlaySoudAtPosition(sSoundEvent, pEntity.GetOrigin());
	}

	//------------------------------------------------------------------------------------------------
	//! Sends a network broadcast so all clients in the session play the sound for a player entity
	//! (e.g. coughing or shouts that nearby players should hear)
	static void BroadcastPlayerSound(int iPlayerId, string sSoundEvent)
	{
		BPR_NetworkManagerComponent pNetworkMgr = BPR_NetworkManagerComponent.GetInstance();
		if (!pNetworkMgr)
		{
			DebugLog.Err(CALLER_ID, "BroadcastPlayerSound failed: NetworkManager not found!");
			return;
		}

		// Payload formatted as "PlayerId:SoundEvent"
		string sPayload = string.Format("%1:%2", iPlayerId, sSoundEvent);
		pNetworkMgr.BroadcastMessage(BPR_ENetworkMessageType.SOUND_TRIGGER, sPayload, iPlayerId);
	}
};
