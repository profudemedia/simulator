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
  SIM.config = SIM.config || { firebase: null };
})();
