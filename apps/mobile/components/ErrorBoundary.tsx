import { Component, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

/**
 * Garde-fou : au lieu d'un crash muet (« a rencontré un problème »),
 * affiche l'erreur JS réelle à l'écran pour pouvoir la diagnostiquer.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: "#07070d" }}
          contentContainerStyle={{ padding: 24, paddingTop: 80 }}
        >
          <Text style={{ color: "#ff2e63", fontSize: 22, fontWeight: "900", marginBottom: 12 }}>
            ⚠️ Whozin — erreur au démarrage
          </Text>
          <Text style={{ color: "#f4f2f8", fontSize: 15, fontWeight: "700", marginBottom: 8 }}>
            {e.name}: {e.message}
          </Text>
          <Text style={{ color: "#8b8b9e", fontSize: 12, fontFamily: "Courier" }}>
            {e.stack?.slice(0, 1500)}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
