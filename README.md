# SafeMove

Aplicativo mobile de monitoramento inteligente de movimento e segurança pessoal,
feito em React Native com JavaScript para Snack Expo e Expo Go.

## Propósito

O SafeMove protege e documenta o usuário durante deslocamentos. Quando o
acelerômetro identifica uma possível queda ou impacto, o aplicativo abre uma
ocorrência ativa. O usuário pode registrar o local do acontecimento com o GPS,
fotografar o ambiente ou danos como evidência e confirmar que está bem para
encerrar o caso. Fora de uma ocorrência, localização e câmera funcionam como
registros preventivos do trajeto.

## Projeto no Snack Expo

[Abrir SafeMove no Snack Expo](https://snack.expo.dev/@soaresdev0109/661322)

O Snack utiliza o SDK 54 para manter compatibilidade com o Expo Go distribuído
pela App Store em dispositivos iOS físicos. O projeto local permanece no SDK 55.

## Executar no Snack Expo

1. Abra [snack.expo.dev](https://snack.expo.dev).
2. Crie um Snack em branco e selecione o SDK 54 para testar em um iPhone físico
   com o Expo Go da App Store.
3. Substitua o conteúdo de `App.js` pelo arquivo deste projeto.
4. Adicione as dependências listadas em `package.json` no painel de dependências.
5. Abra o QR Code com o Expo Go em um iPhone físico.

O código principal está integralmente no `App.js` para facilitar a importação.

## Executar localmente

```bash
npm install
npx expo start
```

Leia o QR Code com o Expo Go. Os sensores funcionam melhor em um aparelho físico.

## Recursos implementados

- Login comum e autenticação biométrica real com `expo-local-authentication`,
  sem aceitar o código do aparelho como substituto da biometria
- Ocorrência ativa persistente conectando todos os sensores
- GPS com `expo-location` para registrar pontos seguros ou o local da ocorrência
- Mapa da posição atual e atalho para o Apple Maps
- Câmera com `expo-camera` para evidências ou registros preventivos
- Detecção de possíveis quedas e impactos com `expo-sensors`
- Notificações locais com `expo-notifications`
- Histórico e sessão persistidos com AsyncStorage
- Native Stack e Bottom Tabs com React Navigation

## Roteiro de apresentação

1. Faça login com nome ou e-mail e mostre o evento no Histórico.
2. Abra Movimento, mova o iPhone e mostre os eixos X, Y e Z.
3. Faça um movimento rápido para abrir uma possível ocorrência.
4. Na ocorrência ativa, abra Localização e registre o local do impacto.
5. Abra Câmera e fotografe uma evidência da situação.
6. Volte ao Início, mostre o checklist completo e encerre a ocorrência.
7. Confira a linha do tempo vinculada no Histórico.

## Observações para iOS

- Câmera, localização e acelerômetro devem ser demonstrados em um iPhone físico.
- Notificações locais funcionam no Expo Go após a permissão do usuário.
- O Touch ID funciona no Expo Go. Por limitação oficial do Expo, o Face ID no
  iOS exige uma development build; o app detecta o Expo Go, explica a limitação
  e não registra o código do aparelho como autenticação biométrica.
- O monitoramento do acelerômetro ocorre enquanto o app está aberto. O projeto
  não solicita localização ou execução contínua em segundo plano.
