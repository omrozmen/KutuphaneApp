namespace Kutuphane.Core.Application.Statistics;

public sealed record StudentStat(
    string Name,
    string Surname,
    int Borrowed,
    int Returned,
    int Late,
    int? Class = null,
    string? Branch = null,
    int? StudentNumber = null,
    int PenaltyPoints = 0,
    bool IsBanned = false);
