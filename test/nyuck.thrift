namespace java com.example.thrift.stooges

struct Nyuck {
    1: required string name
    2: required string language
}

service StoogesBase {
    Nyuck ok20p(1: Nyuck nyuck)
    Nyuck ok40p(1: Nyuck nyuck)
    Nyuck ok60p(1: Nyuck nyuck)
    Nyuck ok80p(1: Nyuck nyuck)

    Nyuck errorClock(1: Nyuck nyuck)
}
