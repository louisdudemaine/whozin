import { ActionSheetIOS, Alert, Platform } from "react-native";
import { blockUser, reportTarget, type ReportType } from "@/lib/data";

// Mêmes motifs que le web (components/SafetyMenu.tsx). Android : une alerte n'a que 3 boutons.
const REASONS: [string, string][] =
  Platform.OS === "ios"
    ? [
        ["spam", "Spam ou arnaque"],
        ["harassment", "Harcèlement"],
        ["inappropriate", "Contenu inapproprié"],
        ["fake", "Faux profil"],
        ["other", "Autre"],
      ]
    : [
        ["inappropriate", "Inapproprié ou harcèlement"],
        ["spam", "Spam ou faux profil"],
      ];

/** Feuille native (iOS) ou alerte (Android) ; renvoie l'index choisi, null si annulé. */
function choose(title: string, options: string[], destructive?: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...options, "Annuler"], cancelButtonIndex: options.length, destructiveButtonIndex: destructive },
        (i) => resolve(i < options.length ? i : null)
      );
    } else {
      Alert.alert(
        title,
        undefined,
        [
          ...options.map((text, i) => ({
            text,
            style: i === destructive ? ("destructive" as const) : ("default" as const),
            onPress: () => resolve(i),
          })),
          { text: "Annuler", style: "cancel" as const, onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) }
      );
    }
  });
}

/**
 * Menu ⋯ de sécurité (Apple 1.2) : signaler l'objet (publication, profil, message) ou bloquer son auteur.
 * `onBlocked` retire tout de suite de l'écran ce que la base masquera désormais.
 */
export async function openSafetyMenu(o: {
  meId: string;
  targetType: ReportType;
  targetId: string;
  targetUserId: string;
  name?: string | null;
  onBlocked?: () => void;
}) {
  if (o.targetUserId === o.meId) return;
  const who = o.name || "cette personne";
  const i = await choose(o.name ? `@${o.name}` : "Options", ["🚩 Signaler", `🚫 Bloquer ${who}`], 1);
  if (i === 0) {
    const r = await choose("Pourquoi tu signales ça ?", REASONS.map(([, label]) => label));
    if (r === null) return;
    const [key, label] = REASONS[r];
    try {
      await reportTarget(o.meId, o.targetType, o.targetId, `${key}: ${label}`);
      Alert.alert("Merci, signalement reçu 🙏", "Tu peux aussi bloquer cette personne.");
    } catch {
      Alert.alert("Signalement non envoyé", "Réessaie dans un instant.");
    }
  } else if (i === 1) {
    Alert.alert(`Bloquer ${who} ?`, "Vous ne verrez plus vos publications, vos présences ni vos messages, dans les deux sens.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Bloquer",
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(o.meId, o.targetUserId);
            o.onBlocked?.();
          } catch {
            Alert.alert("Blocage impossible pour le moment", "Réessaie dans un instant.");
          }
        },
      },
    ]);
  }
}
