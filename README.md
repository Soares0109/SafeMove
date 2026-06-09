# SafeMove

Aplicativo mobile de monitoramento inteligente de movimento e segurança pessoal,
feito em React Native com JavaScript para Snack Expo e Expo Go.

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

- Login comum e autenticação biométrica com `expo-local-authentication`
- GPS com `expo-location`
- Câmera e prévia da foto com `expo-camera`
- Leitura e detecção de movimento brusco com `expo-sensors`
- Notificações locais com `expo-notifications`
- Histórico e sessão persistidos com AsyncStorage
- Native Stack e Bottom Tabs com React Navigation

## Roteiro de apresentação

1. Faça login com nome ou e-mail e mostre o evento no Histórico.
2. Abra Localização, permita o GPS e registre uma posição.
3. Abra Movimento, mova o iPhone e mostre os eixos X, Y e Z.
4. Faça um movimento rápido para demonstrar alerta, notificação e histórico.
5. Abra Câmera, permita o acesso e tire uma foto.
6. Confira todos os registros no Histórico e demonstre o botão de limpar.
7. Use o botão de sair no canto superior da tela Início.

## Observações para iOS

- Câmera, localização e acelerômetro devem ser demonstrados em um iPhone físico.
- Notificações locais funcionam no Expo Go após a permissão do usuário.
- O Touch ID funciona no Expo Go. Por limitação oficial do Expo, o Face ID no
  iOS pode exigir uma development build; o app trata essa situação com uma
  mensagem amigável.
- O monitoramento do acelerômetro ocorre enquanto o app está aberto. O projeto
  não solicita localização ou execução contínua em segundo plano.
