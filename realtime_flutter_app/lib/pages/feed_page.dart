import 'package:flutter/material.dart';
import '../services/firebase_service.dart';
import '../models/accident.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final _firebaseService = FirebaseService();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Accident>>(
      stream: _firebaseService.getAccidents(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (!snapshot.hasData || snapshot.data!.isEmpty) {
          return const Center(child: Text('No incidents reported'));
        }

        final accidents = snapshot.data!;

        return ListView.builder(
          padding: const EdgeInsets.all(8),
          itemCount: accidents.length,
          itemBuilder: (context, index) {
            final accident = accidents[index];
            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: ListTile(
                title: Text(accident.title),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    Text(
                      accident.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Chip(
                          label: Text(accident.severity),
                          backgroundColor: _getSeverityColor(accident.severity),
                        ),
                        Chip(
                          label: Text(accident.status),
                          backgroundColor: _getStatusColor(accident.status),
                        ),
                      ],
                    ),
                  ],
                ),
                onTap: () => _showAccidentDetails(context, accident),
              ),
            );
          },
        );
      },
    );
  }

  void _showAccidentDetails(BuildContext context, Accident accident) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(accident.title),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(accident.description),
              const SizedBox(height: 12),
              Text('Status: ${accident.status}'),
              Text('Severity: ${accident.severity}'),
              Text('Reported by: ${accident.createdBy}'),
              Text('Created: ${accident.createdAt.toLocal()}'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Color _getSeverityColor(String severity) {
    switch (severity) {
      case 'critical':
        return Colors.red;
      case 'high':
        return Colors.orange;
      case 'medium':
        return Colors.yellow;
      default:
        return Colors.green;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'resolved':
        return Colors.green;
      case 'responded':
        return Colors.blue;
      case 'pending':
        return Colors.grey;
      default:
        return Colors.blue[100]!;
    }
  }
}
