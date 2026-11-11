/* Configurarea legăturii dintre tablete și tablă (Etapa 3).
   Cât timp firebase este null, modul Clasă funcționează doar între ferestre de pe același
   dispozitiv (pentru test). Pentru tablete reale, aici se lipește configurația proiectului Firebase:

   SIM.config.firebase = {
     apiKey: '…',
     authDomain: '….firebaseapp.com',
     databaseURL: 'https://…-default-rtdb.europe-west1.firebasedatabase.app',
     projectId: '…',
   };
*/
(function () {
  const SIM = (window.SIM = window.SIM || {});
  SIM.config = SIM.config || {
    firebase: {
      apiKey: 'AIzaSyAOKJx4vL3IsB-P7S0NPNa2-UCiI9fEvio',
      authDomain: 'simulator-miscari-aparat.firebaseapp.com',
      databaseURL: 'https://simulator-miscari-aparat-default-rtdb.europe-west1.firebasedatabase.app',
      projectId: 'simulator-miscari-aparat',
      storageBucket: 'simulator-miscari-aparat.firebasestorage.app',
      messagingSenderId: '586012774901',
      appId: '1:586012774901:web:e20ad614da99fe9c65d0bc',
    },
  };
})();
