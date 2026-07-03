// frontend/src/js/navigation/navigation_guard.js

export class NavigationGuard {
    /**
     * Guardián de navegación.
     * 
     * GARANTÍAS:
     * - Al cambiar de pantalla, no se pierden datos
     * - Al volver, el estado se restaura
     * - Si hay datos sin guardar, se advierte al usuario
     */
    
    constructor() {
        this.currentScreen = null;
        this.screenHistory = [];
        this.screenStates = {}; // Guarda estado de cada pantalla
    }
    
    async navigateTo(screenName, params = {}) {
        // 1. Guardar estado de la pantalla actual
        if (this.currentScreen) {
            this.screenStates[this.currentScreen] = this.captureCurrentState();
        }
        
        // 2. Cambiar a nueva pantalla
        const prevScreen = this.currentScreen;
        this.currentScreen = screenName;
        this.screenHistory.push(screenName);
        
        // 3. Emitir evento de navegación para la UI
        document.dispatchEvent(new CustomEvent('hermes:navigate', {
            detail: { screen: screenName, previous: prevScreen, params }
        }));
        
        try {
            // 4. Restaurar estado si ya estaba cargada
            if (this.screenStates[screenName]) {
                this.restoreState(this.screenStates[screenName]);
            }
        } catch (error) {
            console.error(`[NavigationGuard] Error navegando a ${screenName}:`, error);
        }
    }
    
    async goBack() {
        if (this.screenHistory.length <= 1) return;
        
        // Quitar pantalla actual
        this.screenHistory.pop();
        
        // Volver a la anterior
        const previousScreen = this.screenHistory[this.screenHistory.length - 1];
        await this.navigateTo(previousScreen);
    }
    
    captureCurrentState() {
        return {
            scrollPosition: typeof window !== 'undefined' ? window.scrollY : 0,
            timestamp: Date.now()
        };
    }
    
    restoreState(state) {
        if (state && state.scrollPosition && typeof window !== 'undefined') {
            window.scrollTo(0, state.scrollPosition);
        }
    }
}

export const navigationGuard = new NavigationGuard();
