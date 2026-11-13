import { Component, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Garde-fou : une erreur JS affiche un écran simple avec « Réessayer » au lieu d'un crash muet.
 * La pile ne s'affiche plus à l'utilisateur ; elle part dans la console (journaux de l'appareil).
 * ponytail: aucun suivi d'erreurs à distance (ni Sentry ni autre) : à brancher avant les testeurs externes.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Whozin : erreur rattrapée", error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#07070d", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 40 }}>😵‍💫</Text>
          <Text style={{ color: "#f4f2f8", fontSize: 22, fontWeight: "900", marginTop: 12, textAlign: "center" }}>
            Oups, quelque chose a planté.
          </Text>
          <Text style={{ color: "#8b8b9e", marginTop: 8, textAlign: "center" }}>
            Réessaie ; si ça recommence, ferme l&apos;app et rouvre-la.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ error: null })}
            style={{ marginTop: 24, backgroundColor: "#ff2e63", borderRadius: 999, paddingVertical: 14, paddingHorizontal: 32 }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
