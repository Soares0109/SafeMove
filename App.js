import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MapView, { Marker } from 'react-native-maps';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

const COLORS = {
  navy: '#071A2B',
  navySoft: '#0E2940',
  blue: '#1769FF',
  blueSoft: '#EAF1FF',
  green: '#19C37D',
  greenSoft: '#E6F9F1',
  red: '#F04455',
  redSoft: '#FFF0F2',
  amber: '#F5A524',
  amberSoft: '#FFF7E8',
  ink: '#10212F',
  muted: '#667A8A',
  line: '#DDE7EE',
  surface: '#FFFFFF',
  background: '#F3F7FA',
};

const STORAGE_KEYS = {
  user: '@safemove/user',
  history: '@safemove/history',
};

const EVENT_META = {
  login: { icon: 'log-in-outline', color: COLORS.blue, soft: COLORS.blueSoft },
  location: {
    icon: 'location-outline',
    color: COLORS.green,
    soft: COLORS.greenSoft,
  },
  movement: {
    icon: 'warning-outline',
    color: COLORS.red,
    soft: COLORS.redSoft,
  },
  photo: {
    icon: 'camera-outline',
    color: COLORS.amber,
    soft: COLORS.amberSoft,
  },
};

const MOVEMENT_THRESHOLD = 2.2;
const ALERT_COOLDOWN_MS = 6000;
const MAX_HISTORY_ITEMS = 100;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const AppContext = createContext(null);
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  )}`;
}

function shortCoordinate(value) {
  return typeof value === 'number' ? value.toFixed(6) : '---';
}

async function loadHistoryFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.history);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function requestNotificationPermission() {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function sendMovementNotification() {
  if (Platform.OS === 'web') return;

  try {
    const allowed = await requestNotificationPermission();
    if (!allowed) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'SafeMove: movimento brusco',
        body: 'Um movimento acima do limite de segurança foi detectado.',
        sound: true,
        data: { screen: 'Movimento' },
      },
      trigger: null,
    });
  } catch {
    // The in-app alert and history still work if notifications are unavailable.
  }
}

function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isBooting, setIsBooting] = useState(true);
  const historyRef = useRef([]);

  useEffect(() => {
    async function restoreSession() {
      try {
        const [savedUser, savedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.user),
          loadHistoryFromStorage(),
        ]);

        historyRef.current = savedHistory;
        setHistory(savedHistory);
        if (savedUser) setUser(savedUser);
      } finally {
        setIsBooting(false);
      }
    }

    restoreSession();
  }, []);

  const addEvent = useCallback(async (event) => {
    const completeEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...event,
    };
    const nextHistory = [completeEvent, ...historyRef.current].slice(
      0,
      MAX_HISTORY_ITEMS
    );

    historyRef.current = nextHistory;
    setHistory(nextHistory);

    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.history,
        JSON.stringify(nextHistory)
      );
    } catch {
      Alert.alert(
        'Não foi possível salvar',
        'O evento aconteceu, mas não foi possível armazená-lo neste dispositivo.'
      );
    }

    return completeEvent;
  }, []);

  const signIn = useCallback(
    async (name, method = 'Acesso comum') => {
      const cleanName = name.trim() || 'Usuário SafeMove';
      await AsyncStorage.setItem(STORAGE_KEYS.user, cleanName);
      await addEvent({
        type: 'login',
        title: 'Login realizado',
        detail: method,
      });
      setUser(cleanName);
    },
    [addEvent]
  );

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.user);
    setUser(null);
    setIsMonitoring(true);
  }, []);

  const clearHistory = useCallback(async () => {
    historyRef.current = [];
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE_KEYS.history);
  }, []);

  const value = useMemo(
    () => ({
      user,
      history,
      isBooting,
      isMonitoring,
      addEvent,
      signIn,
      signOut,
      clearHistory,
      setIsMonitoring,
    }),
    [
      addEvent,
      clearHistory,
      history,
      isBooting,
      isMonitoring,
      signIn,
      signOut,
      user,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useSafeMove() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useSafeMove must be used inside AppProvider');
  return context;
}

function PrimaryButton({
  label,
  icon,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? COLORS.surface : COLORS.blue} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={19}
              color={isPrimary ? COLORS.surface : COLORS.blue}
            />
          ) : null}
          <Text
            style={[
              styles.buttonText,
              isPrimary ? styles.buttonTextPrimary : styles.buttonTextSecondary,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function ScreenShell({ children, scroll = true, dark = false }) {
  if (!scroll) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, dark && styles.safeAreaDark]}
      >
        <View style={styles.screenContent}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, dark && styles.safeAreaDark]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScreenTitle({ eyebrow, title, description, light = false }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={[styles.eyebrow, light && styles.textGreen]}>{eyebrow}</Text>
      <Text style={[styles.screenTitle, light && styles.textWhite]}>
        {title}
      </Text>
      {description ? (
        <Text style={[styles.screenDescription, light && styles.textOnDark]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

function StatusPill({ active, activeText = 'Monitoramento ativo' }) {
  return (
    <View
      style={[
        styles.statusPill,
        active ? styles.statusPillActive : styles.statusPillPaused,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          { backgroundColor: active ? COLORS.green : COLORS.amber },
        ]}
      />
      <Text
        style={[
          styles.statusText,
          { color: active ? '#08734A' : '#946111' },
        ]}
      >
        {active ? activeText : 'Monitoramento pausado'}
      </Text>
    </View>
  );
}

function EventRow({ event }) {
  const meta = EVENT_META[event.type] || EVENT_META.login;
  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: meta.soft }]}>
        <Ionicons name={meta.icon} size={21} color={meta.color} />
      </View>
      <View style={styles.eventContent}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text numberOfLines={2} style={styles.eventDetail}>
          {event.detail}
        </Text>
        <Text style={styles.eventTime}>{formatDateTime(event.timestamp)}</Text>
      </View>
    </View>
  );
}

function EmptyState({ icon, title, description }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={COLORS.blue} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

function LoginScreen() {
  const { signIn } = useSafeMove();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID / Touch ID');

  useEffect(() => {
    async function identifyBiometricType() {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
          )
        ) {
          setBiometricLabel('Face ID');
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setBiometricLabel('Touch ID');
        }
      } catch {
        setBiometricLabel('Biometria');
      }
    }

    identifyBiometricType();
  }, []);

  async function handleCommonLogin() {
    if (!name.trim()) {
      Alert.alert(
        'Informe seu nome',
        'Digite um nome ou e-mail para continuar.'
      );
      return;
    }

    try {
      setIsLoading(true);
      await signIn(name, 'Acesso com nome ou e-mail');
    } catch {
      Alert.alert(
        'Não foi possível entrar',
        'Verifique o armazenamento do dispositivo e tente novamente.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricLogin() {
    try {
      setIsBiometricLoading(true);
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware) {
        Alert.alert(
          'Biometria indisponível',
          'Este dispositivo não possui um sensor biométrico compatível.'
        );
        return;
      }

      if (!isEnrolled) {
        Alert.alert(
          'Biometria não configurada',
          'Cadastre o Face ID ou Touch ID nos ajustes do dispositivo antes de continuar.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar no SafeMove',
        fallbackLabel: 'Usar código do dispositivo',
        cancelLabel: 'Cancelar',
      });

      if (result.success) {
        await signIn(name, `Acesso com ${biometricLabel}`);
      } else if (result.error !== 'user_cancel' && result.error !== 'app_cancel') {
        Alert.alert(
          'Autenticação não concluída',
          Platform.OS === 'ios'
            ? 'Não foi possível validar a biometria. No Expo Go para iOS, o Face ID pode exigir uma development build.'
            : 'Não foi possível validar a biometria. Tente novamente ou use o acesso comum.'
        );
      }
    } catch {
      Alert.alert(
        'Biometria indisponível',
        'Não foi possível iniciar a autenticação biométrica.'
      );
    } finally {
      setIsBiometricLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.loginKeyboard}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.loginScreen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.loginGlowOne} />
        <View style={styles.loginGlowTwo} />

        <View style={styles.loginBrand}>
          <View style={styles.brandIcon}>
            <Ionicons name="shield-checkmark" size={34} color={COLORS.green} />
          </View>
          <Text style={styles.brandName}>SafeMove</Text>
          <Text style={styles.brandTagline}>
            Movimento monitorado. Segurança em primeiro lugar.
          </Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.loginCardHeader}>
            <Text style={styles.loginCardEyebrow}>ACESSO SEGURO</Text>
            <Text style={styles.loginCardTitle}>Bem-vindo</Text>
            <Text style={styles.loginCardDescription}>
              Identifique-se para iniciar seu painel de proteção pessoal.
            </Text>
          </View>

          <Text style={styles.inputLabel}>Nome ou e-mail</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color={COLORS.muted} />
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setName}
              onSubmitEditing={handleCommonLogin}
              placeholder="Como devemos chamar você?"
              placeholderTextColor="#91A1AD"
              returnKeyType="go"
              style={styles.input}
              value={name}
            />
          </View>

          <PrimaryButton
            icon="arrow-forward"
            label="Entrar"
            loading={isLoading}
            onPress={handleCommonLogin}
          />

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.separatorLine} />
          </View>

          <PrimaryButton
            icon="scan-outline"
            label={`Entrar com ${biometricLabel}`}
            loading={isBiometricLoading}
            onPress={handleBiometricLogin}
            variant="secondary"
          />
        </View>

        <View style={styles.loginFootnote}>
          <Ionicons name="lock-closed-outline" size={15} color="#9FB2C1" />
          <Text style={styles.loginFootnoteText}>
            Seus registros permanecem armazenados neste dispositivo.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DashboardScreen({ navigation }) {
  const { user, history, isMonitoring, signOut } = useSafeMove();

  const lastAlert = useMemo(
    () => history.find((event) => event.type === 'movement'),
    [history]
  );
  const lastLocation = useMemo(
    () => history.find((event) => event.type === 'location'),
    [history]
  );

  const actions = [
    {
      label: 'Localização',
      caption: 'Registrar posição',
      icon: 'location',
      color: COLORS.green,
      soft: COLORS.greenSoft,
      route: 'Localização',
    },
    {
      label: 'Movimento',
      caption: 'Ver sensor ao vivo',
      icon: 'pulse',
      color: COLORS.red,
      soft: COLORS.redSoft,
      route: 'Movimento',
    },
    {
      label: 'Câmera',
      caption: 'Registrar evidência',
      icon: 'camera',
      color: COLORS.amber,
      soft: COLORS.amberSoft,
      route: 'Câmera',
    },
    {
      label: 'Histórico',
      caption: `${history.length} evento${history.length === 1 ? '' : 's'}`,
      icon: 'time',
      color: COLORS.blue,
      soft: COLORS.blueSoft,
      route: 'Histórico',
    },
  ];

  function confirmSignOut() {
    Alert.alert('Sair do SafeMove?', 'O histórico permanecerá neste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <ScreenShell dark>
      <StatusBar style="light" />
      <View style={styles.dashboardTop}>
        <View style={styles.dashboardGreetingRow}>
          <View style={styles.dashboardGreeting}>
            <Text style={styles.dashboardHello}>Olá,</Text>
            <Text numberOfLines={1} style={styles.dashboardName}>
              {user}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Sair da conta"
            onPress={confirmSignOut}
            style={({ pressed }) => [
              styles.iconButtonDark,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="log-out-outline" size={21} color={COLORS.surface} />
          </Pressable>
        </View>

        <View style={styles.protectionCard}>
          <View style={styles.protectionRing}>
            <View style={styles.protectionRingInner}>
              <Ionicons
                name={isMonitoring ? 'shield-checkmark' : 'shield-outline'}
                size={39}
                color={isMonitoring ? COLORS.green : COLORS.amber}
              />
            </View>
          </View>
          <View style={styles.protectionContent}>
            <StatusPill active={isMonitoring} />
            <Text style={styles.protectionTitle}>
              {isMonitoring ? 'Você está protegido' : 'Proteção em espera'}
            </Text>
            <Text style={styles.protectionDescription}>
              {isMonitoring
                ? 'O acelerômetro está acompanhando movimentos acima do limite.'
                : 'Ative o monitoramento na aba Movimento.'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.dashboardBody}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>Acesso rápido</Text>
          <Text style={styles.sectionMeta}>SENSORES</Text>
        </View>

        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.route}
              onPress={() => navigation.navigate(action.route)}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.actionIcon,
                  { backgroundColor: action.soft },
                ]}
              >
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionCaption}>{action.caption}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
          Resumo recente
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={[styles.summaryIcon, { backgroundColor: COLORS.redSoft }]}>
              <Ionicons name="warning-outline" size={21} color={COLORS.red} />
            </View>
            <Text style={styles.summaryLabel}>Último alerta</Text>
          </View>
          <Text style={styles.summaryValue}>
            {lastAlert ? lastAlert.title : 'Nenhum alerta registrado'}
          </Text>
          <Text style={styles.summaryDetail}>
            {lastAlert
              ? formatDateTime(lastAlert.timestamp)
              : 'Movimentos bruscos aparecerão aqui.'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View
              style={[styles.summaryIcon, { backgroundColor: COLORS.greenSoft }]}
            >
              <Ionicons name="location-outline" size={21} color={COLORS.green} />
            </View>
            <Text style={styles.summaryLabel}>Última localização</Text>
          </View>
          <Text style={styles.summaryValue}>
            {lastLocation
              ? `${shortCoordinate(lastLocation.latitude)}, ${shortCoordinate(
                  lastLocation.longitude
                )}`
              : 'Localização ainda não registrada'}
          </Text>
          <Text style={styles.summaryDetail}>
            {lastLocation
              ? formatDateTime(lastLocation.timestamp)
              : 'Use a aba Localização para salvar sua posição.'}
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}

function LocationScreen() {
  const { addEvent, history } = useSafeMove();
  const lastSaved = useMemo(
    () => history.find((event) => event.type === 'location'),
    [history]
  );
  const [location, setLocation] = useState(
    lastSaved
      ? {
          latitude: lastSaved.latitude,
          longitude: lastSaved.longitude,
          accuracy: lastSaved.accuracy,
        }
      : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(
    lastSaved ? 'Última posição salva no aparelho.' : 'Pronto para localizar.'
  );
  const mapRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }
    : null;

  async function updateLocation() {
    try {
      setIsLoading(true);
      setMessage('Buscando sinal de localização...');

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setMessage('Os Serviços de Localização estão desativados.');
        Alert.alert(
          'Localização desativada',
          'Ative os Serviços de Localização nos ajustes do iPhone e tente novamente.'
        );
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('Permissão de localização não concedida.');
        Alert.alert(
          'Permissão necessária',
          'O SafeMove precisa da localização durante o uso para registrar sua posição.'
        );
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coordinates = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
      };

      setLocation(coordinates);
      setMessage('Localização atualizada e salva com segurança.');
      await addEvent({
        type: 'location',
        title: 'Localização registrada',
        detail: `${shortCoordinate(coordinates.latitude)}, ${shortCoordinate(
          coordinates.longitude
        )}`,
        ...coordinates,
      });
    } catch {
      setMessage('Não foi possível obter a localização agora.');
      Alert.alert(
        'Falha ao localizar',
        'Confira a permissão, o sinal de GPS e tente novamente.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function openInMaps() {
    if (!location) return;

    const label = encodeURIComponent('Minha localização no SafeMove');
    const coordinates = `${location.latitude},${location.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?ll=${coordinates}&q=${label}`
        : `https://www.google.com/maps/search/?api=1&query=${coordinates}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Não foi possível abrir o mapa',
        'Tente novamente depois de atualizar sua localização.'
      );
    }
  }

  return (
    <ScreenShell>
      <StatusBar style="dark" />
      <ScreenTitle
        description="Capture sua posição atual e mantenha um registro local para situações de segurança."
        eyebrow="GPS EM TEMPO REAL"
        title="Localização"
      />

      <View style={styles.mapVisual}>
        {mapRegion ? (
          <MapView
            mapType="standard"
            region={mapRegion}
            showsCompass
            showsMyLocationButton
            showsUserLocation
            style={styles.map}
          >
            <Marker
              coordinate={mapRegion}
              description={`${shortCoordinate(
                location.latitude
              )}, ${shortCoordinate(location.longitude)}`}
              pinColor={COLORS.blue}
              title="Você está aqui"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapPlaceholderIcon}>
              <Ionicons name="map-outline" size={30} color={COLORS.blue} />
            </View>
            <Text style={styles.mapPlaceholderTitle}>
              Sua posição aparecerá aqui
            </Text>
            <Text style={styles.mapPlaceholderText}>
              Atualize a localização para visualizar o mapa.
            </Text>
          </View>
        )}
        <View style={styles.gpsBadge}>
          <View style={styles.gpsBadgeDot} />
          <Text style={styles.gpsBadgeText}>
            {location ? 'POSIÇÃO ATUAL' : 'GPS'}
          </Text>
        </View>
      </View>

      <View style={styles.coordinateCard}>
        <View style={styles.coordinateColumn}>
          <Text style={styles.coordinateLabel}>LATITUDE</Text>
          <Text style={styles.coordinateValue}>
            {shortCoordinate(location?.latitude)}
          </Text>
        </View>
        <View style={styles.coordinateDivider} />
        <View style={styles.coordinateColumn}>
          <Text style={styles.coordinateLabel}>LONGITUDE</Text>
          <Text style={styles.coordinateValue}>
            {shortCoordinate(location?.longitude)}
          </Text>
        </View>
      </View>

      <View style={styles.infoStrip}>
        <Ionicons
          name={location ? 'checkmark-circle' : 'information-circle-outline'}
          size={20}
          color={location ? COLORS.green : COLORS.blue}
        />
        <View style={styles.infoStripContent}>
          <Text style={styles.infoStripText}>{message}</Text>
          {location?.accuracy ? (
            <Text style={styles.infoStripSubtext}>
              Precisão aproximada: {Math.round(location.accuracy)} metros
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.pageButtonWrap}>
        <PrimaryButton
          icon="navigate"
          label="Atualizar localização"
          loading={isLoading}
          onPress={updateLocation}
        />
      </View>
      {location ? (
        <View style={styles.secondaryPageButtonWrap}>
          <PrimaryButton
            icon="map-outline"
            label="Abrir no Mapas"
            onPress={openInMaps}
            variant="secondary"
          />
        </View>
      ) : null}
    </ScreenShell>
  );
}

function MovementScreen() {
  const { addEvent, isMonitoring, setIsMonitoring } = useSafeMove();
  const [sensorData, setSensorData] = useState({ x: 0, y: 0, z: 0 });
  const [intensity, setIntensity] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [lastAlert, setLastAlert] = useState(null);
  const lastAlertAtRef = useRef(0);

  useEffect(() => {
    let subscription;
    let mounted = true;

    async function startSensor() {
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!mounted) return;
        setIsAvailable(available);
        if (!available || !isMonitoring) return;

        Accelerometer.setUpdateInterval(180);
        subscription = Accelerometer.addListener((data) => {
          const nextIntensity = Math.sqrt(
            data.x * data.x + data.y * data.y + data.z * data.z
          );

          setSensorData(data);
          setIntensity(nextIntensity);

          const now = Date.now();
          if (
            nextIntensity >= MOVEMENT_THRESHOLD &&
            now - lastAlertAtRef.current >= ALERT_COOLDOWN_MS
          ) {
            lastAlertAtRef.current = now;
            setLastAlert(now);
            addEvent({
              type: 'movement',
              title: 'Movimento brusco detectado',
              detail: `Intensidade aproximada: ${nextIntensity.toFixed(2)} g`,
              intensity: nextIntensity,
            });
            sendMovementNotification();
          }
        });
      } catch {
        if (mounted) setIsAvailable(false);
      }
    }

    startSensor();
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [addEvent, isMonitoring]);

  async function toggleMonitoring() {
    if (!isMonitoring) {
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!available) {
          Alert.alert(
            'Sensor indisponível',
            'O acelerômetro não está disponível neste dispositivo.'
          );
          return;
        }
        requestNotificationPermission();
      } catch {
        Alert.alert(
          'Sensor indisponível',
          'Não foi possível iniciar o acelerômetro.'
        );
        return;
      }
    }
    setIsMonitoring(!isMonitoring);
  }

  const movementRatio = Math.min(intensity / 3.5, 1);
  const isDanger = intensity >= MOVEMENT_THRESHOLD;

  return (
    <ScreenShell>
      <StatusBar style="dark" />
      <ScreenTitle
        description="Observe os eixos do acelerômetro e receba alertas quando o aparelho sofrer movimentos bruscos."
        eyebrow="ACELERÔMETRO"
        title="Movimento"
      />

      <View style={styles.monitorCard}>
        <View style={styles.monitorTopRow}>
          <StatusPill active={isMonitoring} activeText="Sensor em leitura" />
          <Text style={styles.thresholdText}>
            Limite {MOVEMENT_THRESHOLD.toFixed(1)} g
          </Text>
        </View>

        <View style={styles.intensityWrap}>
          <View
            style={[
              styles.intensityCircle,
              isDanger && styles.intensityCircleDanger,
            ]}
          >
            <Text
              style={[
                styles.intensityValue,
                isDanger && styles.textDanger,
              ]}
            >
              {intensity.toFixed(2)}
            </Text>
            <Text style={styles.intensityUnit}>g</Text>
          </View>
          <Text style={styles.intensityLabel}>INTENSIDADE ATUAL</Text>
        </View>

        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${movementRatio * 100}%`,
                backgroundColor: isDanger ? COLORS.red : COLORS.green,
              },
            ]}
          />
          <View style={styles.meterThreshold} />
        </View>

        <View style={styles.axisGrid}>
          {[
            { axis: 'X', value: sensorData.x, color: COLORS.blue },
            { axis: 'Y', value: sensorData.y, color: COLORS.green },
            { axis: 'Z', value: sensorData.z, color: COLORS.amber },
          ].map((item) => (
            <View key={item.axis} style={styles.axisCard}>
              <Text style={[styles.axisLabel, { color: item.color }]}>
                EIXO {item.axis}
              </Text>
              <Text style={styles.axisValue}>{item.value.toFixed(2)}</Text>
              <Text style={styles.axisUnit}>g</Text>
            </View>
          ))}
        </View>
      </View>

      {!isAvailable ? (
        <View style={[styles.alertCard, styles.alertCardWarning]}>
          <Ionicons name="warning-outline" size={24} color={COLORS.amber} />
          <View style={styles.alertCardContent}>
            <Text style={styles.alertCardTitle}>Acelerômetro indisponível</Text>
            <Text style={styles.alertCardDescription}>
              Abra o projeto em um iPhone físico para demonstrar este sensor.
            </Text>
          </View>
        </View>
      ) : lastAlert ? (
        <View style={[styles.alertCard, styles.alertCardDanger]}>
          <Ionicons name="alert-circle" size={25} color={COLORS.red} />
          <View style={styles.alertCardContent}>
            <Text style={styles.alertCardTitle}>Movimento brusco detectado</Text>
            <Text style={styles.alertCardDescription}>
              Alerta salvo em {formatDateTime(lastAlert)}.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.infoStrip}>
          <Ionicons name="phone-portrait-outline" size={20} color={COLORS.blue} />
          <View style={styles.infoStripContent}>
            <Text style={styles.infoStripText}>
              Movimente o aparelho para acompanhar os valores.
            </Text>
            <Text style={styles.infoStripSubtext}>
              Há um intervalo de {ALERT_COOLDOWN_MS / 1000}s entre alertas.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.pageButtonWrap}>
        <PrimaryButton
          icon={isMonitoring ? 'pause' : 'play'}
          label={
            isMonitoring ? 'Pausar monitoramento' : 'Iniciar monitoramento'
          }
          onPress={toggleMonitoring}
          variant={isMonitoring ? 'secondary' : 'primary'}
        />
      </View>
    </ScreenShell>
  );
}

function CameraScreen() {
  const { addEvent } = useSafeMove();
  const isFocused = useIsFocused();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [photo, setPhoto] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [cameraError, setCameraError] = useState('');

  async function takePhoto() {
    if (!cameraRef.current || !isCameraReady) return;

    try {
      setIsTakingPhoto(true);
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.72,
      });
      setPhoto(result.uri);
      await addEvent({
        type: 'photo',
        title: 'Foto registrada',
        detail: 'Imagem capturada pela câmera do SafeMove.',
      });
    } catch {
      Alert.alert(
        'Não foi possível fotografar',
        'Verifique a câmera e tente novamente.'
      );
    } finally {
      setIsTakingPhoto(false);
    }
  }

  function toggleFacing() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }

  if (!permission) {
    return (
      <ScreenShell>
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.blue} size="large" />
          <Text style={styles.centerStateText}>Verificando câmera...</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <StatusBar style="dark" />
      <ScreenTitle
        description="Registre uma imagem do ambiente. O evento será adicionado ao histórico local."
        eyebrow="REGISTRO VISUAL"
        title="Câmera"
      />

      {!permission.granted ? (
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={31} color={COLORS.blue} />
          </View>
          <Text style={styles.permissionTitle}>Permissão para câmera</Text>
          <Text style={styles.permissionDescription}>
            Autorize o acesso para registrar imagens durante uma situação de
            segurança.
          </Text>
          <PrimaryButton
            icon="key-outline"
            label="Permitir acesso à câmera"
            onPress={requestPermission}
          />
        </View>
      ) : cameraError ? (
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={31} color={COLORS.blue} />
          </View>
          <Text style={styles.permissionTitle}>Câmera indisponível</Text>
          <Text style={styles.permissionDescription}>
            Não foi possível iniciar a câmera neste dispositivo. Abra o SafeMove
            em um iPhone físico e tente novamente.
          </Text>
          <PrimaryButton
            icon="refresh"
            label="Tentar novamente"
            onPress={() => setCameraError('')}
            variant="secondary"
          />
        </View>
      ) : photo ? (
        <View>
          <View style={styles.cameraFrame}>
            <Image source={{ uri: photo }} style={styles.cameraPreview} />
            <View style={styles.photoSavedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
              <Text style={styles.photoSavedText}>Foto registrada</Text>
            </View>
          </View>
          <View style={styles.cameraButtonRow}>
            <View style={styles.cameraButtonFlex}>
              <PrimaryButton
                icon="refresh"
                label="Nova foto"
                onPress={() => setPhoto(null)}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      ) : isFocused ? (
        <View>
          <View style={styles.cameraFrame}>
            <CameraView
              facing={facing}
              onCameraReady={() => setIsCameraReady(true)}
              onMountError={(event) =>
                setCameraError(
                  event?.message || 'Não foi possível iniciar a câmera.'
                )
              }
              ref={cameraRef}
              style={styles.cameraPreview}
            />
            <View style={styles.cameraGuide}>
              <View style={styles.cameraCornerTopLeft} />
              <View style={styles.cameraCornerTopRight} />
              <View style={styles.cameraCornerBottomLeft} />
              <View style={styles.cameraCornerBottomRight} />
            </View>
            <Pressable
              accessibilityLabel="Alternar câmera"
              onPress={toggleFacing}
              style={({ pressed }) => [
                styles.flipCameraButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="white" />
            </Pressable>
          </View>

          <View style={styles.shutterRow}>
            <View style={styles.shutterSpacer} />
            <Pressable
              accessibilityLabel="Tirar foto"
              disabled={!isCameraReady || isTakingPhoto}
              onPress={takePhoto}
              style={({ pressed }) => [
                styles.shutterOuter,
                pressed && styles.buttonPressed,
              ]}
            >
              {isTakingPhoto ? (
                <ActivityIndicator color={COLORS.blue} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
            <View style={styles.shutterSpacer}>
              <Text style={styles.shutterHint}>TOQUE PARA{'\n'}REGISTRAR</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <ActivityIndicator color={COLORS.blue} size="large" />
          <Text style={styles.permissionTitle}>Preparando câmera</Text>
        </View>
      )}
    </ScreenShell>
  );
}

function HistoryScreen() {
  const { history, clearHistory } = useSafeMove();

  function confirmClearHistory() {
    if (!history.length) return;

    Alert.alert(
      'Limpar todo o histórico?',
      'Esta ação remove os registros salvos neste dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearHistory();
            } catch {
              Alert.alert(
                'Não foi possível limpar',
                'Tente novamente em alguns instantes.'
              );
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.historyHeader}>
        <View style={styles.historyTitleWrap}>
          <Text style={styles.eyebrow}>REGISTROS LOCAIS</Text>
          <Text style={styles.screenTitle}>Histórico</Text>
          <Text style={styles.screenDescription}>
            {history.length} evento{history.length === 1 ? '' : 's'} salvo
            {history.length === 1 ? '' : 's'} neste aparelho.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Limpar histórico"
          disabled={!history.length}
          onPress={confirmClearHistory}
          style={({ pressed }) => [
            styles.clearButton,
            !history.length && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.red} />
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={[
          styles.historyList,
          !history.length && styles.historyListEmpty,
        ]}
        data={history}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            description="Use os sensores do SafeMove para criar seus primeiros registros."
            icon="time-outline"
            title="Nenhum evento ainda"
          />
        }
        renderItem={({ item }) => <EventRow event={item} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const TAB_ICONS = {
  Início: ['home', 'home-outline'],
  Localização: ['location', 'location-outline'],
  Movimento: ['pulse', 'pulse-outline'],
  Câmera: ['camera', 'camera-outline'],
  Histórico: ['time', 'time-outline'],
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: false,
        tabBarActiveTintColor: COLORS.blue,
        tabBarInactiveTintColor: '#8293A0',
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ color, focused, size }) => {
          const icons = TAB_ICONS[route.name] || TAB_ICONS.Início;
          return (
            <Ionicons
              color={color}
              name={focused ? icons[0] : icons[1]}
              size={focused ? size + 1 : size}
            />
          );
        },
      })}
    >
      <Tab.Screen component={DashboardScreen} name="Início" />
      <Tab.Screen component={LocationScreen} name="Localização" />
      <Tab.Screen component={MovementScreen} name="Movimento" />
      <Tab.Screen component={CameraScreen} name="Câmera" />
      <Tab.Screen component={HistoryScreen} name="Histórico" />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, isBooting } = useSafeMove();

  if (isBooting) {
    return (
      <View style={styles.bootScreen}>
        <StatusBar style="light" />
        <View style={styles.brandIcon}>
          <Ionicons name="shield-checkmark" size={34} color={COLORS.green} />
        </View>
        <ActivityIndicator color={COLORS.green} style={styles.bootIndicator} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen component={MainTabs} name="SafeMove" />
        ) : (
          <Stack.Screen component={LoginScreen} name="Login" />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeAreaDark: {
    backgroundColor: COLORS.navy,
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
  },
  eyebrow: {
    color: COLORS.blue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  screenTitle: {
    color: COLORS.ink,
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  screenDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  textWhite: {
    color: COLORS.surface,
  },
  textGreen: {
    color: COLORS.green,
  },
  textOnDark: {
    color: '#AFC0CD',
  },
  textDanger: {
    color: COLORS.red,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
  },
  buttonPrimary: {
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  buttonSecondary: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  buttonTextPrimary: {
    color: COLORS.surface,
  },
  buttonTextSecondary: {
    color: COLORS.blue,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusPillActive: {
    backgroundColor: COLORS.greenSoft,
  },
  statusPillPaused: {
    backgroundColor: COLORS.amberSoft,
  },
  statusDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loginKeyboard: {
    backgroundColor: COLORS.navy,
    flex: 1,
  },
  loginScreen: {
    backgroundColor: COLORS.navy,
    flexGrow: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 42,
  },
  loginGlowOne: {
    backgroundColor: '#0E4762',
    borderRadius: 150,
    height: 260,
    opacity: 0.36,
    position: 'absolute',
    right: -120,
    top: -100,
    width: 260,
  },
  loginGlowTwo: {
    backgroundColor: '#063954',
    borderRadius: 130,
    bottom: -100,
    height: 250,
    left: -120,
    opacity: 0.46,
    position: 'absolute',
    width: 250,
  },
  loginBrand: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandIcon: {
    alignItems: 'center',
    backgroundColor: '#10314A',
    borderColor: '#1E5269',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  brandName: {
    color: COLORS.surface,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 13,
  },
  brandTagline: {
    color: '#9FB2C1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    maxWidth: 285,
    textAlign: 'center',
  },
  loginCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 26,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
  },
  loginCardHeader: {
    marginBottom: 21,
  },
  loginCardEyebrow: {
    color: COLORS.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  loginCardTitle: {
    color: COLORS.ink,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 5,
  },
  loginCardDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  inputLabel: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: '#F7F9FB',
    borderColor: COLORS.line,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  input: {
    color: COLORS.ink,
    flex: 1,
    fontSize: 15,
    minHeight: 53,
    paddingLeft: 10,
  },
  separator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginVertical: 16,
  },
  separatorLine: {
    backgroundColor: COLORS.line,
    flex: 1,
    height: 1,
  },
  separatorText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  loginFootnote: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 20,
  },
  loginFootnoteText: {
    color: '#9FB2C1',
    fontSize: 11,
  },
  bootScreen: {
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    flex: 1,
    justifyContent: 'center',
  },
  bootIndicator: {
    marginTop: 22,
  },
  dashboardTop: {
    backgroundColor: COLORS.navy,
    paddingBottom: 27,
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  dashboardGreetingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  dashboardGreeting: {
    flex: 1,
  },
  dashboardHello: {
    color: '#9FB2C1',
    fontSize: 13,
    fontWeight: '600',
  },
  dashboardName: {
    color: COLORS.surface,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 2,
    maxWidth: '90%',
  },
  iconButtonDark: {
    alignItems: 'center',
    backgroundColor: '#12334D',
    borderColor: '#24465F',
    borderRadius: 15,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  protectionCard: {
    alignItems: 'center',
    backgroundColor: COLORS.navySoft,
    borderColor: '#1D425C',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 17,
  },
  protectionRing: {
    alignItems: 'center',
    borderColor: '#1C4A57',
    borderRadius: 42,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    marginRight: 15,
    width: 84,
  },
  protectionRingInner: {
    alignItems: 'center',
    backgroundColor: '#10354A',
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  protectionContent: {
    flex: 1,
  },
  protectionTitle: {
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 11,
  },
  protectionDescription: {
    color: '#AFC0CD',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  dashboardBody: {
    backgroundColor: COLORS.background,
    paddingBottom: 2,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  sectionTitleSpaced: {
    marginBottom: 12,
    marginTop: 26,
  },
  sectionMeta: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  actionCard: {
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 19,
    borderWidth: 1,
    padding: 14,
    width: '48.5%',
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionLabel: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 14,
  },
  actionCaption: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    padding: 15,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },
  summaryDetail: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  mapVisual: {
    backgroundColor: '#DDEAF1',
    borderRadius: 24,
    height: 230,
    marginHorizontal: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    height: '100%',
    width: '100%',
  },
  mapPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#E6EFF4',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  mapPlaceholderIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.blueSoft,
    borderRadius: 22,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  mapPlaceholderTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 13,
  },
  mapPlaceholderText: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  gpsBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    left: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    top: 13,
  },
  gpsBadgeDot: {
    backgroundColor: COLORS.green,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  gpsBadgeText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  coordinateCard: {
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 17,
  },
  coordinateColumn: {
    alignItems: 'center',
    flex: 1,
  },
  coordinateDivider: {
    backgroundColor: COLORS.line,
    width: 1,
  },
  coordinateLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  coordinateValue: {
    color: COLORS.ink,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginTop: 7,
  },
  infoStrip: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginVertical: 14,
    padding: 13,
  },
  infoStripContent: {
    flex: 1,
  },
  infoStripText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  infoStripSubtext: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  pageButtonWrap: {
    marginHorizontal: 20,
  },
  secondaryPageButtonWrap: {
    marginHorizontal: 20,
    marginTop: 10,
  },
  monitorCard: {
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: 20,
    padding: 17,
  },
  monitorTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  thresholdText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  intensityWrap: {
    alignItems: 'center',
    marginVertical: 22,
  },
  intensityCircle: {
    alignItems: 'baseline',
    backgroundColor: COLORS.greenSoft,
    borderColor: '#C8F2E1',
    borderRadius: 62,
    borderWidth: 8,
    flexDirection: 'row',
    height: 124,
    justifyContent: 'center',
    paddingTop: 31,
    width: 124,
  },
  intensityCircleDanger: {
    backgroundColor: COLORS.redSoft,
    borderColor: '#FFD8DD',
  },
  intensityValue: {
    color: COLORS.ink,
    fontSize: 35,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  intensityUnit: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 3,
  },
  intensityLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginTop: 10,
  },
  meterTrack: {
    backgroundColor: '#E9F0F4',
    borderRadius: 6,
    height: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  meterFill: {
    borderRadius: 6,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  meterThreshold: {
    backgroundColor: COLORS.red,
    bottom: -2,
    left: `${(MOVEMENT_THRESHOLD / 3.5) * 100}%`,
    position: 'absolute',
    top: -2,
    width: 2,
  },
  axisGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 21,
  },
  axisCard: {
    alignItems: 'center',
    backgroundColor: '#F7F9FB',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 12,
  },
  axisLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  axisValue: {
    color: COLORS.ink,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginTop: 7,
  },
  axisUnit: {
    color: COLORS.muted,
    fontSize: 9,
    marginTop: 1,
  },
  alertCard: {
    alignItems: 'flex-start',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginHorizontal: 20,
    marginVertical: 14,
    padding: 14,
  },
  alertCardDanger: {
    backgroundColor: COLORS.redSoft,
    borderColor: '#FFD3D9',
  },
  alertCardWarning: {
    backgroundColor: COLORS.amberSoft,
    borderColor: '#FFE6B6',
  },
  alertCardContent: {
    flex: 1,
  },
  alertCardTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  alertCardDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  permissionCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: 20,
    padding: 24,
  },
  permissionIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.blueSoft,
    borderRadius: 25,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  permissionTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7,
    marginTop: 17,
  },
  permissionDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 21,
    textAlign: 'center',
  },
  cameraFrame: {
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    height: 415,
    marginHorizontal: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraPreview: {
    height: '100%',
    width: '100%',
  },
  cameraGuide: {
    bottom: 35,
    left: 30,
    position: 'absolute',
    right: 30,
    top: 35,
  },
  cameraCornerTopLeft: {
    borderLeftColor: 'white',
    borderLeftWidth: 2,
    borderTopColor: 'white',
    borderTopLeftRadius: 8,
    borderTopWidth: 2,
    height: 35,
    left: 0,
    opacity: 0.8,
    position: 'absolute',
    top: 0,
    width: 35,
  },
  cameraCornerTopRight: {
    borderRightColor: 'white',
    borderRightWidth: 2,
    borderTopColor: 'white',
    borderTopRightRadius: 8,
    borderTopWidth: 2,
    height: 35,
    opacity: 0.8,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 35,
  },
  cameraCornerBottomLeft: {
    borderBottomColor: 'white',
    borderBottomLeftRadius: 8,
    borderBottomWidth: 2,
    borderLeftColor: 'white',
    borderLeftWidth: 2,
    bottom: 0,
    height: 35,
    left: 0,
    opacity: 0.8,
    position: 'absolute',
    width: 35,
  },
  cameraCornerBottomRight: {
    borderBottomColor: 'white',
    borderBottomRightRadius: 8,
    borderBottomWidth: 2,
    borderRightColor: 'white',
    borderRightWidth: 2,
    bottom: 0,
    height: 35,
    opacity: 0.8,
    position: 'absolute',
    right: 0,
    width: 35,
  },
  flipCameraButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(7,26,43,0.68)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 19,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 42,
  },
  shutterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 17,
  },
  shutterSpacer: {
    alignItems: 'flex-end',
    flex: 1,
  },
  shutterOuter: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.blue,
    borderRadius: 38,
    borderWidth: 3,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  shutterInner: {
    backgroundColor: COLORS.blue,
    borderRadius: 29,
    height: 58,
    width: 58,
  },
  shutterHint: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 12,
    textAlign: 'right',
  },
  photoSavedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    bottom: 14,
    flexDirection: 'row',
    gap: 6,
    left: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: 'absolute',
  },
  photoSavedText: {
    color: '#08734A',
    fontSize: 11,
    fontWeight: '900',
  },
  cameraButtonRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
  },
  cameraButtonFlex: {
    flex: 1,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  centerStateText: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 12,
  },
  historyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  historyTitleWrap: {
    flex: 1,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: COLORS.redSoft,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    marginTop: 2,
    width: 44,
  },
  historyList: {
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  historyListEmpty: {
    flexGrow: 1,
  },
  eventRow: {
    backgroundColor: COLORS.surface,
    borderColor: '#E4EBF0',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 13,
  },
  eventIcon: {
    alignItems: 'center',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    width: 44,
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  eventDetail: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  eventTime: {
    color: '#91A1AD',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 7,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: COLORS.blueSoft,
    borderRadius: 28,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 16,
  },
  emptyDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: '#E4EBF0',
    height: Platform.OS === 'ios' ? 84 : 67,
    paddingBottom: Platform.OS === 'ios' ? 22 : 8,
    paddingTop: 8,
  },
  tabItem: {
    paddingHorizontal: 0,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '800',
  },
});
