class Accident {
  final String id;
  final String title;
  final String description;
  final double latitude;
  final double longitude;
  final String status;
  final String severity;
  final DateTime createdAt;
  final String createdBy;
  final List<String> responders;
  final bool resolved;
  final List<String> images;

  Accident({
    required this.id,
    required this.title,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.status,
    required this.severity,
    required this.createdAt,
    required this.createdBy,
    this.responders = const [],
    this.resolved = false,
    this.images = const [],
  });

  factory Accident.fromMap(Map<String, dynamic> map, String docId) {
    return Accident(
      id: docId,
      title: map['title'] ?? '',
      description: map['description'] ?? '',
      latitude: (map['location']?['latitude'] ?? 0).toDouble(),
      longitude: (map['location']?['longitude'] ?? 0).toDouble(),
      status: map['status'] ?? 'pending',
      severity: map['severity'] ?? 'low',
      createdAt: map['createdAt']?.toDate() ?? DateTime.now(),
      createdBy: map['createdBy'] ?? '',
      responders: List<String>.from(map['responders'] ?? []),
      resolved: map['resolved'] ?? false,
      images: List<String>.from(map['images'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'title': title,
      'description': description,
      'location': {'latitude': latitude, 'longitude': longitude},
      'status': status,
      'severity': severity,
      'createdAt': createdAt,
      'createdBy': createdBy,
      'responders': responders,
      'resolved': resolved,
      'images': images,
    };
  }
}
