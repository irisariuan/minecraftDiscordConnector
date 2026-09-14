package limbo

// Per-version packet numbering for the waiting world.
//
// Play-phase packet ids are assigned by the order packets happen to be declared
// in the game's source, so they move whenever a release adds or removes one.
// There is no pattern to infer and no way to negotiate them: a wrong id is a
// malformed packet, and a malformed packet disconnects the player. They can only
// be looked up.
//
// The table below is therefore exhaustive rather than clever, and a client whose
// version is not in it gets no waiting world at all. That is the safe direction
// to fail in: a version the proxy has never heard of falls back to the mute hold,
// which needs no play-phase packets and works on anything from 1.13. A guess
// would fail in the other direction.
//
// Configuration-phase ids are not in the table because they have not moved once
// since the phase was introduced; they are constants below.

// Configuration-phase packet ids, identical in every version this package
// serves. Only the two the waiting world actually uses are named: an id that is
// never sent or read is an id nothing has ever checked, and a list of them
// reads like knowledge the package does not have.
const (
	cbFinishConfiguration    = 0x03
	sbAckFinishConfiguration = 0x03
)

// profile is the numbering and the handful of layout quirks for one protocol
// version.
type profile struct {
	// Clientbound play.
	//
	// loginPlay is only needed when the proxy has to build that packet itself,
	// which it does for a world it fetched rather than recorded. A recorded one
	// carries the backend's own id and is replayed with it.
	loginPlay       int32
	gameEvent       int32
	syncPosition    int32
	playerAbilities int32
	systemChat      int32
	keepAlive       int32
	storeCookie     int32
	transfer        int32

	// Serverbound play. Chat arrives three ways and all three are accepted:
	// the client picks between the signed and unsigned command packets based on
	// whether the command it parsed has signable arguments, and a player who
	// types without a slash sends an ordinary chat message instead.
	sbKeepAlive         int32
	sbChatCommand       int32
	sbChatCommandSigned int32
	sbChatMessage       int32

	// modernSyncPosition selects the layout Synchronize Player Position took in
	// 1.21.2: the teleport id moved to the front, three velocity doubles were
	// added, and the relative-field flags widened from a byte to an int.
	modernSyncPosition bool
	// strictErrorHandling is the trailing boolean Login Success carried for the
	// three releases between its introduction in 1.20.5 and its removal in
	// 1.21.2.
	strictErrorHandling bool
	// sessionID is the UUID that joined Login Success in the 26.x line.
	sessionID bool
	// seaLevel is the field 1.21.2 added to Login (play), and onlineMode the
	// one the 26.x line added after it. Both sit near the end of a packet that
	// is otherwise unchanged across every version here.
	seaLevel   bool
	onlineMode bool
}

// profiles is the complete set of client versions that can be given a waiting
// world, keyed by the protocol number sent in the handshake.
//
// Two gaps are deliberate, and both are gaps in the record rather than in the
// protocol: 774 (1.21.11) and 775 (26.1) have no published packet numbering at
// all, and interpolating between 773 and 776 would be a guess that disconnects
// somebody with no explanation if it were wrong. They fall back to the hold.
//
// Every number here was taken from the protocol documentation for that exact
// version and then checked against two independent sources that do not share
// its lineage, because a single transcription error is invisible until it
// disconnects a player.
var profiles = map[int32]profile{
	// 1.20.5 and 1.20.6.
	766: {
		loginPlay: 0x2B, gameEvent: 0x22, syncPosition: 0x40, playerAbilities: 0x38,
		systemChat: 0x6C, keepAlive: 0x26, storeCookie: 0x6B,
		transfer:    0x73,
		sbKeepAlive: 0x18, sbChatCommand: 0x04, sbChatCommandSigned: 0x05,
		sbChatMessage:       0x06,
		strictErrorHandling: true,
	},
	// 1.21 and 1.21.1.
	767: {
		loginPlay: 0x2B, gameEvent: 0x22, syncPosition: 0x40, playerAbilities: 0x38,
		systemChat: 0x6C, keepAlive: 0x26, storeCookie: 0x6B,
		transfer:    0x73,
		sbKeepAlive: 0x18, sbChatCommand: 0x04, sbChatCommandSigned: 0x05,
		sbChatMessage:       0x06,
		strictErrorHandling: true,
	},
	// 1.21.2 and 1.21.3.
	768: {
		loginPlay: 0x2C, gameEvent: 0x23, syncPosition: 0x42, playerAbilities: 0x3A,
		systemChat: 0x73, keepAlive: 0x27, storeCookie: 0x72,
		transfer:    0x7A,
		sbKeepAlive: 0x1A, sbChatCommand: 0x05, sbChatCommandSigned: 0x06,
		sbChatMessage:      0x07,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 1.21.4.
	769: {
		loginPlay: 0x2C, gameEvent: 0x23, syncPosition: 0x42, playerAbilities: 0x3A,
		systemChat: 0x73, keepAlive: 0x27, storeCookie: 0x72,
		transfer:    0x7A,
		sbKeepAlive: 0x1A, sbChatCommand: 0x05, sbChatCommandSigned: 0x06,
		sbChatMessage:      0x07,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 1.21.5.
	770: {
		loginPlay: 0x2B, gameEvent: 0x22, syncPosition: 0x41, playerAbilities: 0x39,
		systemChat: 0x72, keepAlive: 0x26, storeCookie: 0x71,
		transfer:    0x7A,
		sbKeepAlive: 0x1A, sbChatCommand: 0x05, sbChatCommandSigned: 0x06,
		sbChatMessage:      0x07,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 1.21.6.
	771: {
		loginPlay: 0x2B, gameEvent: 0x22, syncPosition: 0x41, playerAbilities: 0x39,
		systemChat: 0x72, keepAlive: 0x26, storeCookie: 0x71,
		transfer:    0x7A,
		sbKeepAlive: 0x1B, sbChatCommand: 0x06, sbChatCommandSigned: 0x07,
		sbChatMessage:      0x08,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 1.21.7 and 1.21.8.
	772: {
		loginPlay: 0x2B, gameEvent: 0x22, syncPosition: 0x41, playerAbilities: 0x39,
		systemChat: 0x72, keepAlive: 0x26, storeCookie: 0x71,
		transfer:    0x7A,
		sbKeepAlive: 0x1B, sbChatCommand: 0x06, sbChatCommandSigned: 0x07,
		sbChatMessage:      0x08,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 1.21.9 and 1.21.10.
	773: {
		loginPlay: 0x30, gameEvent: 0x26, syncPosition: 0x46, playerAbilities: 0x3E,
		systemChat: 0x77, keepAlive: 0x2B, storeCookie: 0x76,
		transfer:    0x7F,
		sbKeepAlive: 0x1B, sbChatCommand: 0x06, sbChatCommandSigned: 0x07,
		sbChatMessage:      0x08,
		modernSyncPosition: true,
		seaLevel:           true,
	},
	// 26.2.
	776: {
		loginPlay: 0x31, gameEvent: 0x26, syncPosition: 0x48, playerAbilities: 0x40,
		systemChat: 0x79, keepAlive: 0x2C, storeCookie: 0x78,
		transfer:    0x81,
		sbKeepAlive: 0x1C, sbChatCommand: 0x07, sbChatCommandSigned: 0x08,
		sbChatMessage:      0x09,
		modernSyncPosition: true,
		seaLevel:           true,
		sessionID:          true,
		onlineMode:         true,
	},
}

func profileFor(protocolVersion int32) (profile, bool) {
	p, ok := profiles[protocolVersion]
	return p, ok
}
