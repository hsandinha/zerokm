// Teste simples para verificar conexão com Firebase
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCCYcm59Sk-DZwhe7Co--BGzzI0NZVd52c",
    authDomain: "zerokm-64d2f.firebaseapp.com",
    projectId: "zerokm-64d2f",
    storageBucket: "zerokm-64d2f.firebasestorage.app",
    messagingSenderId: "10708933516",
    appId: "1:10708933516:web:41a16d6e84854fa2d454a9",
    measurementId: "G-V4ZPR6Q59K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFirebase() {
    try {
        console.log('Testando conexão com Firebase...');

        const testDoc = {
            teste: 'Documento de teste',
            timestamp: new Date(),
            numero: 123
        };

        // Testar coleção test
        const docRef = await addDoc(collection(db, 'test'), testDoc);
        console.log('Sucesso! Documento de teste criado com ID:', docRef.id);


        const vehicleRef = await addDoc(collection(db, 'vehicles'), testVehicle);
        console.log('Sucesso! Veículo de teste criado com ID:', vehicleRef.id);

    } catch (error) {
        console.error('Erro ao conectar com Firebase:', error);
        console.error('Detalhes do erro:', error.message);
        if (error.code) {
            console.error('Código do erro:', error.code);
        }
    }
}

testFirebase();