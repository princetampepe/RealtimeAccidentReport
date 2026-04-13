import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/accident.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal();

  // Auth Methods
  Future<UserCredential?> signUp(String email, String password) async {
    try {
      return await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
    } catch (e) {
      return null;
    }
  }

  Future<UserCredential?> signIn(String email, String password) async {
    try {
      return await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } catch (e) {
      return null;
    }
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }

  User? getCurrentUser() {
    return _auth.currentUser;
  }

  Stream<User?> authStateChanges() {
    return _auth.authStateChanges();
  }

  // Accident Methods
  Future<void> createAccident(Accident accident) async {
    try {
      await _firestore.collection('accidents').add(accident.toMap());
    } catch (e) {
      // Error handled silently
    }
  }

  Stream<List<Accident>> getAccidents() {
    return _firestore
        .collection('accidents')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs
              .map((doc) => Accident.fromMap(doc.data(), doc.id))
              .toList();
        });
  }

  Future<void> updateAccidentStatus(String accidentId, String status) async {
    try {
      await _firestore.collection('accidents').doc(accidentId).update({
        'status': status,
      });
    } catch (e) {
      // Error handled silently
    }
  }

  Future<void> requestResolution(String accidentId) async {
    try {
      await _firestore.collection('accidents').doc(accidentId).update({
        'status': 'resolution_requested',
      });
    } catch (e) {
      // Error handled silently
    }
  }

  Future<void> confirmResolution(String accidentId) async {
    try {
      await _firestore.collection('accidents').doc(accidentId).update({
        'resolved': true,
        'status': 'resolved',
      });
    } catch (e) {
      // Error handled silently
    }
  }
}
