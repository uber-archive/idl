namespace java com.example.thrift.joe

include "../../footeam/stooges/nyuck.thrift"

service Stooges extends nyuck.StoogesBase {
    nyuck.Nyuck nyuck(1: nyuck.Nyuck nyuck)
}
