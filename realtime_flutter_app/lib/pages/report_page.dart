import 'package:flutter/material.dart';
import '../services/firebase_service.dart';
import '../models/accident.dart';

class ReportPage extends StatefulWidget {
  const ReportPage({super.key});

  @override
  State<ReportPage> createState() => _ReportPageState();
}

class _ReportPageState extends State<ReportPage> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _firebaseService = FirebaseService();
  String _selectedSeverity = 'low';
  bool _isLoading = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submitReport() async {
    if (_titleController.text.isEmpty || _descriptionController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final accident = Accident(
        id: '',
        title: _titleController.text,
        description: _descriptionController.text,
        latitude: 0,
        longitude: 0,
        status: 'pending',
        severity: _selectedSeverity,
        createdAt: DateTime.now(),
        createdBy: _firebaseService.getCurrentUser()?.uid ?? '',
      );

      await _firebaseService.createAccident(accident);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report submitted successfully')),
        );
        _titleController.clear();
        _descriptionController.clear();
        setState(() => _selectedSeverity = 'low');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Report an Incident',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _titleController,
            decoration: InputDecoration(
              labelText: 'Incident Title',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descriptionController,
            decoration: InputDecoration(
              labelText: 'Description',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            maxLines: 5,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _selectedSeverity,
            onChanged: (value) =>
                setState(() => _selectedSeverity = value ?? 'low'),
            items: ['low', 'medium', 'high', 'critical']
                .map(
                  (e) =>
                      DropdownMenuItem(value: e, child: Text(e.toUpperCase())),
                )
                .toList(),
            decoration: InputDecoration(
              labelText: 'Severity',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _submitReport,
              child: _isLoading
                  ? const CircularProgressIndicator()
                  : const Text('Submit Report'),
            ),
          ),
        ],
      ),
    );
  }
}
