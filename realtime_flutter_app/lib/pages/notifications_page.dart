import 'package:flutter/material.dart';

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        NotificationCard(
          title: 'New incident nearby',
          message: 'A new incident has been reported in your area',
          time: '2 minutes ago',
        ),
        NotificationCard(
          title: 'Status update',
          message: 'Your reported incident has been marked as responded',
          time: '1 hour ago',
        ),
        NotificationCard(
          title: 'Resolution confirmation needed',
          message: 'Please confirm the resolution of your incident',
          time: '3 hours ago',
        ),
      ],
    );
  }
}

class NotificationCard extends StatelessWidget {
  final String title;
  final String message;
  final String time;

  const NotificationCard({
    required this.title,
    required this.message,
    required this.time,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                Text(
                  time,
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(message, style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
